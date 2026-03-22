import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient, cognitoDisableUser, cognitoEnableUser, cognitoUpdateAttributes } from "./cognito-admin";

const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe("cognito-admin", () => {
  beforeEach(() => {
    cognitoMock.reset();
  });

  it("cognitoDisableUser sends AdminDisableUserCommand", async () => {
    cognitoMock.on(AdminDisableUserCommand).resolves({});
    await cognitoDisableUser("user-123");
    const calls = cognitoMock.commandCalls(AdminDisableUserCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Username).toBe("user-123");
  });

  it("cognitoEnableUser sends AdminEnableUserCommand", async () => {
    cognitoMock.on(AdminEnableUserCommand).resolves({});
    await cognitoEnableUser("user-456");
    const calls = cognitoMock.commandCalls(AdminEnableUserCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Username).toBe("user-456");
  });

  it("cognitoUpdateAttributes sends AdminUpdateUserAttributesCommand", async () => {
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    await cognitoUpdateAttributes("user-789", {
      "custom:role": "tutor",
      "custom:status": "active",
    });
    const calls = cognitoMock.commandCalls(AdminUpdateUserAttributesCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Username).toBe("user-789");
    expect(calls[0].args[0].input.UserAttributes).toEqual([
      { Name: "custom:role", Value: "tutor" },
      { Name: "custom:status", Value: "active" },
    ]);
  });

  it("cognitoClient is exported", () => {
    expect(cognitoClient).toBeDefined();
  });
});
