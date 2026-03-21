// src/lib/callable.ts
// Custom Cloud Function caller that works with both Firebase and Cognito auth.
// Uses the Firebase Callable protocol: POST { data } → { result }.

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const REGION = "us-central1";
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";
const EMULATOR_HOST = import.meta.env.VITE_EMULATOR_HOST ?? "localhost";

function getFunctionUrl(name: string): string {
  if (USE_EMULATORS) {
    return `http://${EMULATOR_HOST}:5001/${PROJECT_ID}/${REGION}/${name}`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

/**
 * Call a Firebase Cloud Function with a Cognito JWT.
 * Follows the Firebase callable protocol for compatibility.
 */
export async function callFunction<TData = unknown, TResult = unknown>(
  name: string,
  data: TData,
  idToken: string,
): Promise<TResult> {
  const url = getFunctionUrl(name);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = body?.error;
    const message = error?.message ?? `Function ${name} returned ${response.status}`;
    throw new Error(message);
  }

  const body = await response.json();
  return body.result as TResult;
}
