// src/lib/cognito.ts
// AWS Cognito client initialization and config constants

import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export const COGNITO_REGION = import.meta.env.VITE_AWS_REGION ?? "us-east-1";
export const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "";
export const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";

export const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_REGION,
});
