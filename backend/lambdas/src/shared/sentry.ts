// Sentry error tracking for Lambda functions.
// Uses @sentry/aws-serverless for Lambda-specific instrumentation.

import * as Sentry from "@sentry/aws-serverless";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: "production",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.2,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.setContext("lambda", context);
  }
  Sentry.captureException(error);
}

export { Sentry };
