import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, setTokenGetter } from "./api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setTokenGetter(null as any);
});

describe("api.get", () => {
  it("sends GET with Content-Type header", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const result = await api.get("/users/me");
    expect(result).toEqual({ id: 1 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/me"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("includes auth header when token getter is set", async () => {
    setTokenGetter(async () => "tok123");
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await api.get("/test");
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer tok123");
  });

  it("skips auth header when token getter throws", async () => {
    setTokenGetter(async () => { throw new Error("expired"); });
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await api.get("/test");
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });
});

describe("api.post", () => {
  it("sends POST with JSON body", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    const result = await api.post("/auth/login", { email: "a@b.com" });
    expect(result).toEqual({ success: true });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ email: "a@b.com" }));
  });
});

describe("api.patch", () => {
  it("sends PATCH request", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    await api.patch("/schools/test.edu/profile", { name: "New" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("PATCH");
  });
});

describe("api.delete", () => {
  it("sends DELETE request", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    await api.delete("/availability/slot1");
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("DELETE");
  });
});

describe("api.publicPost", () => {
  it("does not include auth header even when token getter is set", async () => {
    setTokenGetter(async () => "tok123");
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    await api.publicPost("/contact/submit", { msg: "hi" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });
});

describe("api.publicGet", () => {
  it("sends GET without auth", async () => {
    setTokenGetter(async () => "tok123");
    mockFetch.mockResolvedValue(jsonResponse({ schools: [] }));
    await api.publicGet("/schools");
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
    expect(opts.method).toBe("GET");
  });
});

describe("error handling", () => {
  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Forbidden", code: "FORBIDDEN" }),
    });
    await expect(api.get("/secret")).rejects.toThrow(ApiError);
    try {
      await api.get("/secret");
    } catch (e) {
      const err = e as ApiError;
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe("Forbidden");
      expect(err.code).toBe("FORBIDDEN");
    }
  });

  it("handles non-JSON error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });
    await expect(api.get("/crash")).rejects.toThrow(ApiError);
  });

  it("handles 204 No Content", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("no body")),
    });
    const result = await api.delete("/resource/1");
    expect(result).toBeUndefined();
  });
});
