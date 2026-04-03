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

const POOL_ID  = process.env.COGNITO_USER_POOL_ID;
const REGION   = process.env.AWS_REGION ?? "us-east-1";
const PASSWORD = "TestTutor123!";   // matches E2E spec

if (!POOL_ID) {
  process.stderr.write("Error: COGNITO_USER_POOL_ID is not set\n");
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });

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

// 1. Create tutor account
const tutorEmail = "test-tutor@testschool.edu";
const tutorUid   = await upsertCognitoUser(tutorEmail, "tutor", "testschool.edu", PASSWORD);

// 2. Create tutee account (password: TestTutee123! — matches E2E spec)
const tuteeEmail = "test-tutee@testschool.edu";
await upsertCognitoUser(tuteeEmail, "tutee", "testschool.edu", "TestTutee123!");

// Output tutor UID for CI to capture
process.stdout.write(tutorUid + "\n");
