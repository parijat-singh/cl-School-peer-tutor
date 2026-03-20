/**
 * Client for integration tests against Firebase emulators.
 * Requires: Auth, Firestore, and Functions emulators running and seeded (scripts/seed-emulator.sh).
 *
 * Environment:
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
 *   FIRESTORE_EMULATOR_HOST=localhost:8090 (optional for REST)
 *   Functions base URL: http://localhost:5001/peertutor-dev/us-central1
 */

const PROJECT_ID = "peertutor-dev";
const AUTH_SIGNIN_URL =
  "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";
const FUNCTIONS_BASE = `http://localhost:5001/${PROJECT_ID}/us-central1`;
const FIRESTORE_REST_BASE = `http://localhost:8090/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 7 : (1 - day + 7) % 7;
  if (diff === 0) d.setDate(d.getDate() + 7);
  else d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Sign in via Auth emulator; returns idToken for use in callable requests.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(AUTH_SIGNIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Auth sign-in failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("No idToken in sign-in response");
  return data.idToken;
}

/**
 * Call a callable Cloud Function (emulator). Body is the `data` payload.
 */
export async function callFunction<T = unknown>(
  fnName: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<{ result?: T; error?: { message: string; code?: number } }> {
  const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string; code?: number } };
  return json;
}

/**
 * Get a Firestore document via REST (Bearer owner for emulator).
 */
export async function getFirestoreDoc(path: string): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_REST_BASE}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer owner" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET failed: ${res.status} ${await res.text()}`);
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string; integerValue?: string; booleanValue?: boolean; mapValue?: { fields?: Record<string, unknown> } }> };
  if (!doc.fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v && typeof v === "object" && "stringValue" in v) out[k] = v.stringValue;
    else if (v && typeof v === "object" && "integerValue" in v) out[k] = v.integerValue;
    else if (v && typeof v === "object" && "booleanValue" in v) out[k] = v.booleanValue;
    else if (v && typeof v === "object" && "mapValue" in v) out[k] = (v as { mapValue?: { fields?: Record<string, unknown> } }).mapValue?.fields ?? {};
  }
  return out;
}

/**
 * Check if emulators are reachable (for conditional skip).
 */
export async function emulatorsReachable(): Promise<boolean> {
  try {
    const [auth, fs] = await Promise.all([
      fetch("http://localhost:9099/", { method: "GET" }).then((r) => r.ok),
      fetch("http://localhost:8090/", { method: "GET" }).then((r) => r.ok),
    ]);
    return auth && fs;
  } catch {
    return false;
  }
}
