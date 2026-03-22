import { describe, it, expect } from "vitest";
import { getAuth } from "./auth.js";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

function makeEvent(
  claims: Record<string, string | undefined> | undefined,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: claims as any, scopes: [] },
      },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("getAuth", () => {
  it("extracts all claims from a fully populated event", () => {
    const event = makeEvent({
      sub: "user-123",
      email: "alice@school.edu",
      "custom:role": "tutor",
      "custom:schoolDomain": "school.edu",
      "custom:status": "active",
    });

    const auth = getAuth(event);
    expect(auth).toEqual({
      uid: "user-123",
      email: "alice@school.edu",
      role: "tutor",
      schoolDomain: "school.edu",
      status: "active",
    });
  });

  it("defaults email to empty string when missing", () => {
    const event = makeEvent({ sub: "user-1" });
    const auth = getAuth(event);
    expect(auth.email).toBe("");
  });

  it("defaults role to 'tutee' when custom:role is missing", () => {
    const event = makeEvent({ sub: "user-1" });
    const auth = getAuth(event);
    expect(auth.role).toBe("tutee");
  });

  it("defaults schoolDomain to null when missing", () => {
    const event = makeEvent({ sub: "user-1" });
    const auth = getAuth(event);
    expect(auth.schoolDomain).toBeNull();
  });

  it("defaults status to 'active' when missing", () => {
    const event = makeEvent({ sub: "user-1" });
    const auth = getAuth(event);
    expect(auth.status).toBe("active");
  });

  it("throws 401 when claims.sub is missing", () => {
    const event = makeEvent({ email: "no-sub@test.com" });
    expect(() => getAuth(event)).toThrow("Unauthorized");
    try {
      getAuth(event);
    } catch (e: any) {
      expect(e.statusCode).toBe(401);
    }
  });

  it("throws 401 when claims object is undefined", () => {
    const event = makeEvent(undefined);
    expect(() => getAuth(event)).toThrow("Unauthorized");
  });

  it("throws 401 when requestContext.authorizer is missing", () => {
    const event = { requestContext: {} } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
    expect(() => getAuth(event)).toThrow("Unauthorized");
  });
});
