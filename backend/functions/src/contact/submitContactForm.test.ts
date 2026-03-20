import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "doc-1" });
vi.mock("../lib/admin", () => ({
  db: { collection: vi.fn(() => ({ add: mockCollectionAdd })) },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { submitContactForm } from "./submitContactForm";
const handler = submitContactForm as any;

describe("submitContactForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing required fields", async () => {
    await expect(handler({ data: { type: "contact", name: "", email: "", message: "" } }))
      .rejects.toThrow("Name, email, and message are required");
  });

  it("rejects invalid email", async () => {
    await expect(handler({
      data: { type: "contact", name: "John", email: "notanemail", message: "Hello there, this is a test message" },
    })).rejects.toThrow("Invalid email address");
  });

  it("rejects short message", async () => {
    await expect(handler({
      data: { type: "contact", name: "John", email: "j@test.com", message: "Short" },
    })).rejects.toThrow("at least 10 characters");
  });

  it("rejects invalid type", async () => {
    await expect(handler({
      data: { type: "other", name: "John", email: "j@test.com", message: "Hello there, this is a test message" },
    })).rejects.toThrow("Type must be contact or feedback");
  });

  it("sends emails and stores submission on valid contact input", async () => {
    const result = await handler({
      data: {
        type: "contact", name: "John", email: "john@test.com",
        subject: "Help", message: "I need help with the platform please",
      },
    });
    expect(result).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2); // admin + confirmation
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: "contact", name: "John",
    }));
  });

  it("sends emails for feedback type with rating", async () => {
    const result = await handler({
      data: {
        type: "feedback", name: "Jane", email: "jane@test.com",
        category: "UX", rating: 4, message: "The platform is great but could improve navigation",
      },
    });
    expect(result).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: "feedback", category: "UX", rating: 4,
    }));
  });

  it("sends emails for feedback type without rating", async () => {
    const result = await handler({
      data: {
        type: "feedback", name: "Jane", email: "jane@test.com",
        category: "General", message: "This is some general feedback about the platform",
      },
    });
    expect(result).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
