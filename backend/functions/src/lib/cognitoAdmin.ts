// functions/src/lib/cognitoAdmin.ts
// AWS Cognito admin client for backend operations (disable/enable user, update attributes)

import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";

// Uses COGNITO_AWS_ACCESS_KEY_ID / COGNITO_AWS_SECRET_ACCESS_KEY if set,
// otherwise falls back to default AWS credential chain.
const credentials =
  process.env.COGNITO_AWS_ACCESS_KEY_ID && process.env.COGNITO_AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.COGNITO_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.COGNITO_AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
  ...(credentials ? { credentials } : {}),
});

export async function cognitoDisableUser(username: string): Promise<void> {
  await cognitoClient.send(
    new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
}

export async function cognitoEnableUser(username: string): Promise<void> {
  await cognitoClient.send(
    new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
}

export async function cognitoUpdateAttributes(
  username: string,
  attributes: Record<string, string>,
): Promise<void> {
  await cognitoClient.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })),
    }),
  );
}
