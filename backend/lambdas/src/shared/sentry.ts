// Sentry error tracking stub.
// @sentry/aws-serverless causes initialization crashes when bundled with esbuild ESM.
// TODO: Re-add Sentry via Lambda Layer or externalized dependency.

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  console.error("[ERROR]", context ? JSON.stringify(context) : "", error);
}

export const Sentry = null;
