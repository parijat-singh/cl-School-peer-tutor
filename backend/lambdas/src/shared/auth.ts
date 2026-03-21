// Extract JWT claims from API Gateway v2 Cognito authorizer.
// No JWKS verification needed — API Gateway validates the token.

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export interface AuthClaims {
  uid: string;
  email: string;
  role: string;
  schoolDomain: string | null;
  status: string;
}

export function getAuth(event: APIGatewayProxyEventV2WithJWTAuthorizer): AuthClaims {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return {
    uid:          claims.sub as string,
    email:        (claims.email as string) ?? "",
    role:         (claims["custom:role"] as string) ?? "tutee",
    schoolDomain: (claims["custom:schoolDomain"] as string) ?? null,
    status:       (claims["custom:status"] as string) ?? "active",
  };
}
