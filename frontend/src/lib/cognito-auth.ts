// src/lib/cognito-auth.ts
// Pure async functions for Cognito auth operations (no React dependencies)

import {
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient, CLIENT_ID } from "./cognito";

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface DecodedIdToken {
  sub: string;
  email: string;
  "custom:role"?: string;
  "custom:schoolDomain"?: string;
  "custom:status"?: string;
  exp: number;
  iat: number;
}

/** Decode a JWT payload without verification (signature verified server-side). */
export function decodeIdToken(idToken: string): DecodedIdToken {
  const payload = idToken.split(".")[1];
  return JSON.parse(atob(payload));
}

export async function cognitoSignUp(
  email: string,
  password: string,
): Promise<{ userSub: string; codeDeliveryDetails?: unknown }> {
  const result = await cognitoClient.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
    }),
  );
  return {
    userSub: result.UserSub!,
    codeDeliveryDetails: result.CodeDeliveryDetails,
  };
}

export async function cognitoConfirmSignUp(
  email: string,
  code: string,
): Promise<void> {
  await cognitoClient.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }),
  );
}

export async function cognitoSignIn(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const result = await cognitoClient.send(
    new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  );

  const authResult = result.AuthenticationResult!;
  return {
    idToken: authResult.IdToken!,
    accessToken: authResult.AccessToken!,
    refreshToken: authResult.RefreshToken!,
    expiresIn: authResult.ExpiresIn!,
  };
}

export async function cognitoRefreshTokens(
  refreshToken: string,
): Promise<Omit<CognitoTokens, "refreshToken">> {
  const result = await cognitoClient.send(
    new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    }),
  );

  const authResult = result.AuthenticationResult!;
  return {
    idToken: authResult.IdToken!,
    accessToken: authResult.AccessToken!,
    expiresIn: authResult.ExpiresIn!,
  };
}

export async function cognitoSignOut(accessToken: string): Promise<void> {
  try {
    await cognitoClient.send(
      new GlobalSignOutCommand({ AccessToken: accessToken }),
    );
  } catch {
    // Best-effort; tokens are cleared client-side regardless
  }
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  await cognitoClient.send(
    new ForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
    }),
  );
}

export async function cognitoConfirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await cognitoClient.send(
    new ConfirmForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }),
  );
}

export async function cognitoResendConfirmationCode(
  email: string,
): Promise<void> {
  await cognitoClient.send(
    new ResendConfirmationCodeCommand({
      ClientId: CLIENT_ID,
      Username: email,
    }),
  );
}

export async function cognitoGetUser(
  accessToken: string,
): Promise<Record<string, string>> {
  const result = await cognitoClient.send(
    new GetUserCommand({ AccessToken: accessToken }),
  );
  const attrs: Record<string, string> = {};
  for (const attr of result.UserAttributes ?? []) {
    if (attr.Name && attr.Value) attrs[attr.Name] = attr.Value;
  }
  return attrs;
}
