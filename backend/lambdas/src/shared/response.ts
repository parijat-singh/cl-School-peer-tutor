// HTTP response helpers for API Gateway v2 proxy integration.

import type { APIGatewayProxyResultV2 } from "aws-lambda";

const CORS_HEADERS = {
  "Content-Type": "application/json",
};

/** Return a JSON success response. */
export function json<T>(body: T, statusCode = 200): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/** Return a JSON error response. */
export function error(statusCode: number, message: string, code?: string): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      error: { code: code ?? httpCodeToString(statusCode), message },
    }),
  };
}

function httpCodeToString(code: number): string {
  switch (code) {
    case 400: return "bad-request";
    case 401: return "unauthenticated";
    case 403: return "permission-denied";
    case 404: return "not-found";
    case 409: return "already-exists";
    case 429: return "resource-exhausted";
    default:  return "internal";
  }
}
