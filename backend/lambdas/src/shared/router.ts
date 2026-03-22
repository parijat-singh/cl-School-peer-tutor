// Lightweight request router for API Gateway v2 HTTP API events.
// Each Lambda group uses this to dispatch to the correct handler based on routeKey.

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { error } from "./response.js";
import { captureError } from "./sentry.js";

export type HandlerFn = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

type RouteMap = Record<string, HandlerFn>;

/**
 * Create a Lambda handler that routes based on `event.routeKey`.
 *
 * Usage:
 * ```ts
 * export const handler = createRouter({
 *   "POST /auth/initialize-user": initializeUser,
 *   "GET /users/me": getMe,
 * });
 * ```
 */
export function createRouter(routes: RouteMap) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // API Gateway sends routeKey like "POST /contact/{proxy+}" for catch-all routes.
    // Try exact match first, then resolve using the actual HTTP method + path.
    const routeKey = event.routeKey; // e.g. "POST /contact/{proxy+}"
    let handler = routes[routeKey];

    if (!handler) {
      // Build resolved key from method + actual path (e.g. "POST /contact/submit")
      const method = event.requestContext?.http?.method ?? routeKey.split(" ")[0];
      const path = event.rawPath ?? routeKey.split(" ")[1];
      const resolvedKey = `${method} ${path}`;
      handler = routes[resolvedKey];
    }

    if (!handler) {
      return error(404, `No handler for route: ${routeKey}`);
    }

    try {
      return await handler(event as APIGatewayProxyEventV2WithJWTAuthorizer);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };

      // Known application errors (thrown with statusCode)
      if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
        return error(e.statusCode, e.message);
      }

      // Unexpected errors
      captureError(e, { routeKey });
      console.error("Unhandled error:", e);
      return error(500, `Internal server error: ${e.message}`);
    }
  };
}

/** Parse JSON body from the event, returning null if absent or invalid. */
export function parseBody<T = Record<string, unknown>>(event: APIGatewayProxyEventV2): T | null {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Get a path parameter by name (e.g. {uid}, {domain}). */
export function pathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) throw Object.assign(new Error(`Missing path parameter: ${name}`), { statusCode: 400 });
  return decodeURIComponent(value);
}

/** Get a query string parameter (returns undefined if absent). */
export function queryParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}
