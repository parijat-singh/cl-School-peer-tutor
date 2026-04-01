#!/usr/bin/env node
/**
 * Seed minimal E2E test accounts in the target Cognito pool + DynamoDB.
 * Idempotent — safe to run on every CI run (uses FORCE_ALIAS to upsert).
 *
 * Required env vars:
 *   COGNITO_USER_POOL_ID   — e.g. us-east-1_SU3aDrmrY
 *   AWS_REGION             — e.g. us-east-1
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *
 * Optional:
 *   DDB_TABLE_USERS        — defaults to pt-users
 *   DDB_TABLE_SCHOOLS      — defaults to pt-schools
 *
 * Stdout: the tutor UID (used by CI to set E2E_TUTOR_UID)
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const POOL_ID      = process.env.COGNITO_USER_POOL_ID;
const REGION       = process.env.AWS_REGION ?? "us-east-1";
const USERS_TABLE  = process.env.DDB_TABLE_USERS   ?? "pt-users";
const SCHOOL_TABLE = process.env.DDB_TABLE_SCHOOLS ?? "pt-schools";
const PASSWORD     = "TestTutor123!";   // matches E2E spec

if (!POOL_ID) {
  process.stderr.write("Error: COGNITO_USER_POOL_ID is not set\n");
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function upsertCognitoUser(email, role, schoolDomain, password) {
  try {
    const res = await cognito.send(new AdminCreateUserCommand({
      UserPoolId:    POOL_ID,
      Username:      email,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email",               Value: email },
        { Name: "email_verified",      Value: "true" },
        { Name: "custom:role",         Value: role },
        { Name: "custom:schoolDomain", Value: schoolDomain },
        { Name: "custom:status",       Value: "active" },
      ],
    }));
    const uid = res.User.Attributes.find(a => a.Name === "sub").Value;
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: POOL_ID, Username: email, Password: password, Permanent: true,
    }));
    return uid;
  } catch (err) {
    if (err.name !== "UsernameExistsException") throw err;
    // User already exists — get UID and ensure password + attributes are up to date
    const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL_ID, Username: email }));
    const uid = u.UserAttributes.find(a => a.Name === "sub").Value;
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: POOL_ID, Username: email,
      UserAttributes: [
        { Name: "custom:role",         Value: role },
        { Name: "custom:schoolDomain", Value: schoolDomain },
        { Name: "custom:status",       Value: "active" },
      ],
    }));
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: POOL_ID, Username: email, Password: password, Permanent: true,
    }));
    return uid;
  }
}

const NOW = new Date().toISOString();

// 1. Ensure testschool.edu exists as an approved school
await ddb.send(new PutCommand({
  TableName: SCHOOL_TABLE,
  Item: {
    domain: "testschool.edu",
    name: "Test School",
    type: "high",
    approved: true,
    status: "active",
    brandColor: "#3B82F6",
    subjects: ["Math", "English", "Science"],
    createdAt: NOW,
  },
}));

// 2. Create tutor account
const tutorEmail = "test-tutor@testschool.edu";
const tutorUid   = await upsertCognitoUser(tutorEmail, "tutor", "testschool.edu", PASSWORD);
await ddb.send(new PutCommand({
  TableName: USERS_TABLE,
  Item: {
    uid: tutorUid,
    email: tutorEmail,
    name: "Test Tutor",
    role: "tutor",
    schoolDomain: "testschool.edu",
    status: "active",
    subjects: ["Math", "English"],
    bio: "E2E test tutor account.",
    avgRating: 4.5,
    reviewCount: 2,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
}));

// 3. Create tutee account (password: TestTutee123! — matches E2E spec)
const tuteeEmail = "test-tutee@testschool.edu";
const tuteeUid   = await upsertCognitoUser(tuteeEmail, "tutee", "testschool.edu", "TestTutee123!");
await ddb.send(new PutCommand({
  TableName: USERS_TABLE,
  Item: {
    uid: tuteeUid,
    email: tuteeEmail,
    name: "Test Tutee",
    role: "tutee",
    schoolDomain: "testschool.edu",
    status: "active",
    grade: "10th",
    subjects: [],
    createdAt: NOW,
    updatedAt: NOW,
  },
}));

// Output tutor UID for CI to capture
process.stdout.write(tutorUid + "\n");
