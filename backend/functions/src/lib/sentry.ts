// lib/sentry.ts
// Sentry error tracking for Cloud Functions.
// Initialised once at cold start; imported by index.ts before any function exports.
//
// SENTRY_DSN is set at deploy time (GitHub CD writes backend/functions/.env) or locally via .env.
// Do not use Secret Manager for the same env var name — it overlaps plain env on Cloud Run.

import * as Sentry from "@sentry/node";

// Skip Sentry in the emulator — no point sending dev errors to prod tracking
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const dsn = isEmulator ? undefined : process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: "production",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.2,
    integrations: [
      Sentry.onUnhandledRejectionIntegration({ mode: "warn" }),
    ],
  });
}

/**
 * Capture an error in Sentry with optional context.
 * Call this in catch blocks to report errors without crashing the function.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.setContext("function", context);
  }
  Sentry.captureException(error);
}

export { Sentry };
