// src/lib/cognito-auth.ts
// Pure async functions for Cognito auth operations (no React dependencies).
// Uses dynamic import() for the AWS SDK to prevent Vite dev server dep
// optimization loops. The SDK is loaded on first auth call, not at page load.

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

// Lazy-loaded SDK modules — cached after first load
let _sdk: typeof import("@aws-sdk/client-cognito-identity-provider") | null = null;
let _cognito: typeof import("./cognito") | null = null;

async function getSDK() {
  if (!_sdk) _sdk = await import("@aws-sdk/client-cognito-identity-provider");
  if (!_cognito) _cognito = await import("./cognito");
  return { sdk: _sdk, client: _cognito.cognitoClient, clientId: _cognito.CLIENT_ID };
}

export async function cognitoSignUp(
  email: string,
  password: string,
): Promise<{ userSub: string; codeDeliveryDetails?: unknown }> {
  const { sdk, client, clientId } = await getSDK();
  const result = await client.send(
    new sdk.SignUpCommand({
      ClientId: clientId,
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
  const { sdk, client, clientId } = await getSDK();
  await client.send(
    new sdk.ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
    }),
  );
}

export async function cognitoSignIn(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const { sdk, client, clientId } = await getSDK();
  const result = await client.send(
    new sdk.InitiateAuthCommand({
      ClientId: clientId,
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
  const { sdk, client, clientId } = await getSDK();
  const result = await client.send(
    new sdk.InitiateAuthCommand({
      ClientId: clientId,
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
    const { sdk, client } = await getSDK();
    await client.send(
      new sdk.GlobalSignOutCommand({ AccessToken: accessToken }),
    );
  } catch {
    // Best-effort; tokens are cleared client-side regardless
  }
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  const { sdk, client, clientId } = await getSDK();
  await client.send(
    new sdk.ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
    }),
  );
}

export async function cognitoConfirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const { sdk, client, clientId } = await getSDK();
  await client.send(
    new sdk.ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }),
  );
}

export async function cognitoResendConfirmationCode(
  email: string,
): Promise<void> {
  const { sdk, client, clientId } = await getSDK();
  await client.send(
    new sdk.ResendConfirmationCodeCommand({
      ClientId: clientId,
      Username: email,
    }),
  );
}

export async function cognitoChangePassword(
  accessToken: string,
  previousPassword: string,
  proposedPassword: string,
): Promise<void> {
  const { sdk, client } = await getSDK();
  await client.send(
    new sdk.ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: previousPassword,
      ProposedPassword: proposedPassword,
    }),
  );
}

export async function cognitoGetUser(
  accessToken: string,
): Promise<Record<string, string>> {
  const { sdk, client } = await getSDK();
  const result = await client.send(
    new sdk.GetUserCommand({ AccessToken: accessToken }),
  );
  const attrs: Record<string, string> = {};
  for (const attr of result.UserAttributes ?? []) {
    if (attr.Name && attr.Value) attrs[attr.Name] = attr.Value;
  }
  return attrs;
}
