// functions/src/lib/cognitoAuth.ts
// Cognito JWT verification middleware — dual-mode (Firebase + Cognito)

import jwksClient from "jwks-rsa";
import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import { HttpsError } from "firebase-functions/v2/https";

// Env vars set from Terraform outputs
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID ?? "";
const REGION = process.env.AWS_REGION ?? "us-east-1";

const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 600_000, // 10 min
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) return callback(err ?? new Error("No signing key"));
    callback(null, key.getPublicKey());
  });
}

export interface AuthClaims {
  uid: string;
  email: string;
  token: {
    role: string;
    schoolDomain: string | null;
    status: string;
  };
}

/**
 * Verify a Cognito ID token and extract normalized claims.
 */
export function verifyCognitoToken(idToken: string): Promise<AuthClaims> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        issuer: ISSUER,
        audience: CLIENT_ID,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err) return reject(err);
        const payload = decoded as Record<string, unknown>;
        resolve({
          uid: payload.sub as string,
          email: payload.email as string,
          token: {
            role: (payload["custom:role"] as string) ?? "tutee",
            schoolDomain: (payload["custom:schoolDomain"] as string) ?? null,
            status: (payload["custom:status"] as string) ?? "active",
          },
        });
      },
    );
  });
}

/**
 * Dual-mode auth: tries Firebase `request.auth` first, falls back to Cognito JWT
 * in the Authorization header. Returns normalized claims usable by all Cloud Functions.
 */
export async function requireAuth(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
  rawRequest?: { headers: { authorization?: string } };
}): Promise<AuthClaims> {
  // Path 1: Firebase Auth (existing path — works with Firebase client SDK)
  if (request.auth) {
    const token = request.auth.token ?? {};
    return {
      uid: request.auth.uid,
      email: (token.email as string) ?? "",
      token: {
        role: (token.role as string) ?? "tutee",
        schoolDomain: (token.schoolDomain as string | null) ?? null,
        status: (token.status as string) ?? "active",
      },
    };
  }

  // Path 2: Cognito JWT in Authorization header
  const authHeader = request.rawRequest?.headers?.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return await verifyCognitoToken(token);
    } catch {
      throw new HttpsError("unauthenticated", "Invalid or expired token.");
    }
  }

  throw new HttpsError("unauthenticated", "Sign in required.");
}
