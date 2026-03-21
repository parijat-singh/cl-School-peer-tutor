// src/lib/api.ts
// HTTP client for the PeerTutor API Gateway backend.
// Replaces callable.ts (Cloud Functions) and firestore.ts (direct reads).

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type GetTokenFn = () => Promise<string>;
let _getToken: GetTokenFn | null = null;

/** Called once by AuthProvider to inject the token getter (avoids circular deps). */
export function setTokenGetter(fn: GetTokenFn) {
  _getToken = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  try {
    const token = await _getToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { public?: boolean },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts?.public) {
    Object.assign(headers, await authHeaders());
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Convenience methods ──────────────────────────────────────────

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** For public endpoints (no auth header) */
  publicPost: <T>(path: string, body?: unknown) => request<T>("POST", path, body, { public: true }),
  publicGet: <T>(path: string) => request<T>("GET", path, undefined, { public: true }),
};
