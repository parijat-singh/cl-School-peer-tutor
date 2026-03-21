// Local development server — wraps Lambda handlers behind a simple HTTP server.
// Simulates API Gateway v2 HTTP API events from plain HTTP requests.
// Usage: npx tsx src/local-server.ts

import http from "node:http";
import { URL } from "node:url";

// Import all Lambda group routers
import { handler as authHandler } from "./handlers/auth/index.js";
import { handler as bookingsHandler } from "./handlers/bookings/index.js";
import { handler as schoolsHandler } from "./handlers/schools/index.js";
import { handler as reviewsHandler } from "./handlers/reviews/index.js";
import { handler as miscHandler } from "./handlers/misc/index.js";

const PORT = Number(process.env.PORT ?? 3001);

// Route prefix → Lambda handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteRule = { prefix: string; handler: (event: any) => Promise<any>; pattern?: RegExp };
const routeMapping: RouteRule[] = [
  { prefix: "/auth/",            handler: authHandler },
  { prefix: "/users/",           handler: authHandler },
  { prefix: "/bookings/",        handler: bookingsHandler },
  { prefix: "/sessions/",        handler: bookingsHandler },
  { prefix: "/booking-requests/", handler: bookingsHandler },
  { prefix: "/schools/",         handler: schoolsHandler },
  { prefix: "/stats/",           handler: schoolsHandler },
  { prefix: "/availability/",    handler: schoolsHandler },
  { prefix: "/audit-log/",       handler: schoolsHandler },
  // /tutors/{uid}/reviews → reviews Lambda; /tutors/{uid}/slots → schools Lambda
  { prefix: "/tutors/",          handler: reviewsHandler, pattern: /^\/tutors\/[^/]+\/reviews$/ },
  { prefix: "/tutors/",          handler: schoolsHandler },
  { prefix: "/reviews/",         handler: reviewsHandler },
  { prefix: "/recommendations/", handler: miscHandler },
  { prefix: "/contact/",         handler: miscHandler },
];

function findHandler(path: string) {
  for (const { prefix, handler, pattern } of routeMapping) {
    // Match both "/schools/..." and "/schools" (no trailing slash)
    if (path.startsWith(prefix) || path + "/" === prefix) {
      // If a pattern is specified, only match if the full path matches
      if (pattern && !pattern.test(path)) continue;
      return handler;
    }
  }
  return null;
}

/** Convert a routeKey-style path to its template form for API Gateway matching. */
function buildRouteKey(method: string, path: string): string {
  // Replace UUID-like segments and domain segments with path parameters
  // e.g. /users/abc123 → /users/{uid}
  // e.g. /schools/example.edu/profile → /schools/{domain}/profile
  const templates: Array<[RegExp, string]> = [
    [/^\/sessions\/(?!mine$)([^/]+)$/, "/sessions/{sessionId}"],
    [/^\/users\/(?!me$|superadmins$)([^/]+)$/, "/users/{uid}"],
    [/^\/tutors\/([^/]+)\/reviews$/, "/tutors/{uid}/reviews"],
    [/^\/tutors\/([^/]+)\/slots$/, "/tutors/{uid}/slots"],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)\/profile$/, "/schools/{domain}/profile"],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)\/logo$/, "/schools/{domain}/logo"],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)\/tutors$/, "/schools/{domain}/tutors"],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)$/, "/schools/{domain}"],
    [/^\/stats\/([^/]+)$/, "/stats/{domain}"],
    [/^\/audit-log\/([^/]+)$/, "/audit-log/{domain}"],
    [/^\/reviews\/([^/]+)\/flag$/, "/reviews/{reviewId}/flag"],
    [/^\/availability\/([^/]+)\/cancel-date$/, "/availability/{slotId}/cancel-date"],
    [/^\/availability\/([^/]+)\/uncancel-date$/, "/availability/{slotId}/uncancel-date"],
    [/^\/availability\/([^/]+)$/, "/availability/{slotId}"],
  ];

  for (const [regex, template] of templates) {
    if (regex.test(path)) {
      return `${method} ${template}`;
    }
  }

  return `${method} ${path}`;
}

/** Extract path parameters from URL based on the route template. */
function extractPathParams(path: string): Record<string, string> {
  const params: Record<string, string> = {};
  const patterns: Array<[RegExp, string[]]> = [
    [/^\/sessions\/(?!mine$)([^/]+)$/, ["sessionId"]],
    [/^\/users\/(?!me$|superadmins$)([^/]+)$/, ["uid"]],
    [/^\/tutors\/([^/]+)\/(reviews|slots)$/, ["uid"]],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)\/(profile|logo|tutors)$/, ["domain"]],
    [/^\/schools\/(?!register$|add$|approve$|reject$|remove$)([^/]+)$/, ["domain"]],
    [/^\/stats\/([^/]+)$/, ["domain"]],
    [/^\/audit-log\/([^/]+)$/, ["domain"]],
    [/^\/reviews\/([^/]+)\/flag$/, ["reviewId"]],
    [/^\/availability\/([^/]+)\/(cancel-date|uncancel-date)$/, ["slotId"]],
    [/^\/availability\/([^/]+)$/, ["slotId"]],
  ];

  for (const [regex, names] of patterns) {
    const match = path.match(regex);
    if (match) {
      names.forEach((name, i) => { params[name] = match[i + 1]; });
      break;
    }
  }

  return params;
}

/** Decode a JWT payload without verification (local dev only). */
function decodeJwtClaims(token: string): Record<string, string> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  const handler = findHandler(path);
  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const bodyStr = Buffer.concat(chunks).toString("utf8");

  // Build API Gateway v2 event
  const routeKey = buildRouteKey(method, path);
  const pathParameters = extractPathParams(path);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });

  // Extract JWT claims from Authorization header
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const claims = token ? decodeJwtClaims(token) : {};

  const event = {
    version: "2.0",
    routeKey,
    rawPath: path,
    rawQueryString: url.search.slice(1),
    headers: req.headers as Record<string, string>,
    queryStringParameters: Object.keys(queryStringParameters).length > 0 ? queryStringParameters : undefined,
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : undefined,
    body: bodyStr || undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: "local",
      apiId: "local",
      authorizer: {
        jwt: {
          claims,
          scopes: [],
        },
      },
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: req.headers["user-agent"] ?? "",
      },
      requestId: `local-${Date.now()}`,
      routeKey,
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };

  try {
    const result = await handler(event) as { statusCode?: number; body?: string; headers?: Record<string, string> };
    const statusCode = result.statusCode ?? 200;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(result.headers ?? {}),
    };
    res.writeHead(statusCode, headers);
    res.end(result.body ?? "");
  } catch (err) {
    console.error("Handler error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  PeerTutor Local API Server`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  DynamoDB endpoint: ${process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000"}\n`);
});
