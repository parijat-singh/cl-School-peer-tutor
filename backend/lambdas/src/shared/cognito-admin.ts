// AWS Cognito admin operations for Lambda handlers.
// Uses the Lambda execution role credentials (no explicit keys needed).

import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";

export const cognitoClient = new CognitoIdentityProviderClient({});

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
