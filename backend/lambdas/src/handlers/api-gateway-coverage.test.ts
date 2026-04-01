/**
 * API Gateway Route Coverage Tests
 *
 * Ensures every route defined in a Lambda handler is reachable through the
 * API Gateway Terraform configuration. Catches the class of bug where a new
 * Lambda route is added (or an old one moved) but the matching API Gateway
 * route entry is forgotten — which causes silent 404s in production.
 *
 * How matching works:
 *   - API GW exact routes      → match Lambda routes with identical template
 *   - API GW `{proxy+}` routes → match any Lambda route whose path starts
 *                                 with the same prefix (greedy wildcard)
 *   - API GW `{param}` routes  → match Lambda routes with the same segment
 *                                 count where non-param segments are identical
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Path helpers ─────────────────────────────────────────────────────────────

const HANDLERS_DIR = __dirname;
const REPO_ROOT    = resolve(__dirname, "../../../../");

function handlerPath(name: string): string {
  return resolve(HANDLERS_DIR, name, "index.ts");
}

function terraformPath(): string {
  return resolve(REPO_ROOT, "infra/terraform/api-gateway.tf");
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Extract every `"METHOD /path":` key from a Lambda handler's createRouter({…})
 * call. Returns strings like "POST /availability/add".
 */
function parseLambdaRoutes(handlerName: string): string[] {
  const content = readFileSync(handlerPath(handlerName), "utf8");
  // Matches quoted route keys: "GET /foo/bar" or "POST /foo/{id}/baz"
  const matches = [...content.matchAll(/"([A-Z]+\s+\/[^"]+)":/g)];
  return matches.map(m => m[1].trim());
}

/**
 * Extract every API Gateway route from the Terraform config.
 * The Terraform map keys look like "auth-POST /auth/{proxy+}" and
 * "schools-DELETE /availability/{proxy+}". We strip the handler prefix.
 */
function parseApiGatewayRoutes(): string[] {
  const content = readFileSync(terraformPath(), "utf8");
  // Match both authenticated and public route entries:
  //   "handler-METHOD /path"   = "..."
  const matches = [...content.matchAll(/"[a-z]+-([A-Z]+\s+\/[^"]+)"\s*=/g)];
  return matches.map(m => m[1].trim());
}

// ── Route matching ───────────────────────────────────────────────────────────

/**
 * Returns true if `lambdaRoute` (a route template like "POST /availability/add")
 * would be served by at least one entry in `gatewayRoutes`.
 *
 * Matching rules (in order):
 *  1. Exact template match ("GET /users/me" === "GET /users/me")
 *  2. Greedy wildcard: GW "METHOD /prefix/{proxy+}" catches any Lambda route
 *     "METHOD /prefix/…" (one or more further segments)
 *  3. Single-level param match: same segment count, non-param GW segments
 *     equal the corresponding Lambda segments
 */
function isRouteReachable(lambdaRoute: string, gatewayRoutes: string[]): boolean {
  const sep          = lambdaRoute.indexOf(" ");
  const lambdaMethod = lambdaRoute.slice(0, sep);
  const lambdaPath   = lambdaRoute.slice(sep + 1);

  for (const gwRoute of gatewayRoutes) {
    const sep2     = gwRoute.indexOf(" ");
    const gwMethod = gwRoute.slice(0, sep2);
    const gwPath   = gwRoute.slice(sep2 + 1);

    if (gwMethod !== lambdaMethod) continue;

    // Rule 1 — exact template match
    if (gwPath === lambdaPath) return true;

    // Rule 2 — greedy {proxy+} wildcard
    if (gwPath.endsWith("/{proxy+}")) {
      const prefix = gwPath.slice(0, -"/{proxy+}".length);
      if (lambdaPath.startsWith(prefix + "/")) return true;
    }

    // Rule 3 — single-level path parameter segments
    const gwSegs     = gwPath.split("/");
    const lambdaSegs = lambdaPath.split("/");
    if (gwSegs.length === lambdaSegs.length) {
      const allMatch = gwSegs.every((seg, i) => {
        const isParam = seg.startsWith("{") && seg.endsWith("}");
        return isParam || seg === lambdaSegs[i];
      });
      if (allMatch) return true;
    }
  }

  return false;
}

// ── Test data ─────────────────────────────────────────────────────────────────

/** Every Lambda handler group and the gateway routes they should be reachable by. */
const HANDLERS = ["auth", "bookings", "schools", "reviews", "misc"] as const;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("API Gateway → Lambda route coverage", () => {
  const gatewayRoutes = parseApiGatewayRoutes();

  // Sanity: the parser found real routes
  it("parses at least 10 API Gateway routes from Terraform config", () => {
    expect(gatewayRoutes.length).toBeGreaterThanOrEqual(10);
  });

  // Per-handler coverage
  for (const handlerName of HANDLERS) {
    describe(`${handlerName} handler`, () => {
      const lambdaRoutes = parseLambdaRoutes(handlerName);

      it("exports at least one route", () => {
        expect(lambdaRoutes.length).toBeGreaterThan(0);
      });

      it("every route is reachable via API Gateway", () => {
        const uncovered = lambdaRoutes.filter(
          r => !isRouteReachable(r, gatewayRoutes),
        );

        expect(
          uncovered,
          `The following ${handlerName} routes have NO matching API Gateway entry:\n` +
          uncovered.map(r => `  • ${r}`).join("\n") +
          `\n\nAvailable gateway routes:\n` +
          gatewayRoutes.map(r => `  • ${r}`).join("\n"),
        ).toHaveLength(0);
      });
    });
  }

  // Whole-suite summary: fail once with the full list if anything is missing
  it("no Lambda route is orphaned (full cross-handler check)", () => {
    const allUncovered: Array<{ handler: string; route: string }> = [];

    for (const handlerName of HANDLERS) {
      const lambdaRoutes = parseLambdaRoutes(handlerName);
      for (const route of lambdaRoutes) {
        if (!isRouteReachable(route, gatewayRoutes)) {
          allUncovered.push({ handler: handlerName, route });
        }
      }
    }

    expect(
      allUncovered,
      "Orphaned routes (Lambda handler has no API Gateway entry):\n" +
      allUncovered.map(({ handler, route }) => `  [${handler}] ${route}`).join("\n"),
    ).toHaveLength(0);
  });
});

// ── Matching-logic unit tests ─────────────────────────────────────────────────

describe("isRouteReachable (matching logic)", () => {
  const gwRoutes = [
    "POST /auth/{proxy+}",
    "GET /users/me",
    "GET /users/{uid}",
    "GET /users/superadmins",
    "GET /schools",
    "GET /schools/{proxy+}",
    "POST /schools/{proxy+}",
    "GET /availability/{proxy+}",
    "POST /availability/{proxy+}",
    "DELETE /availability/{proxy+}",
    "PATCH /availability/{proxy+}",
    "GET /tutors/{uid}/slots",
    "GET /tutors/{uid}/reviews",
    "GET /sessions/{proxy+}",
    "POST /sessions/{proxy+}",
    "GET /booking-requests/{proxy+}",
    "POST /bookings/{proxy+}",
    "POST /reviews/{proxy+}",
    "GET /reviews/{proxy+}",
    "POST /recommendations/{proxy+}",
    "POST /contact/{proxy+}",
    "POST /schools/register",   // public exact route
  ];

  // ── True positives: routes that SHOULD be reachable ──

  it("exact route matches itself", () => {
    expect(isRouteReachable("GET /users/me", gwRoutes)).toBe(true);
  });

  it("{proxy+} catches single trailing segment", () => {
    expect(isRouteReachable("POST /auth/initialize-user", gwRoutes)).toBe(true);
  });

  it("{proxy+} catches multiple trailing segments", () => {
    expect(isRouteReachable("POST /availability/abc123/cancel-date", gwRoutes)).toBe(true);
  });

  it("{proxy+} catches route with path param as last segment", () => {
    expect(isRouteReachable("DELETE /availability/{slotId}", gwRoutes)).toBe(true);
  });

  it("{proxy+} catches route with path params in multiple positions", () => {
    expect(isRouteReachable("POST /availability/{slotId}/cancel-date", gwRoutes)).toBe(true);
  });

  it("single-level param route matches same-depth Lambda route", () => {
    expect(isRouteReachable("GET /users/{uid}", gwRoutes)).toBe(true);
  });

  it("exact two-param route matches (GET /tutors/{uid}/slots)", () => {
    expect(isRouteReachable("GET /tutors/{uid}/slots", gwRoutes)).toBe(true);
  });

  it("schools proxy+ catches domain subpath /tutors", () => {
    expect(isRouteReachable("GET /schools/{domain}/tutors", gwRoutes)).toBe(true);
  });

  it("schools proxy+ catches single domain segment", () => {
    expect(isRouteReachable("GET /schools/{domain}", gwRoutes)).toBe(true);
  });

  it("PATCH availability proxy+ catches slot update", () => {
    expect(isRouteReachable("PATCH /availability/{slotId}", gwRoutes)).toBe(true);
  });

  it("public exact route matches", () => {
    expect(isRouteReachable("POST /schools/register", gwRoutes)).toBe(true);
  });

  it("contact proxy+ catches submit subpath", () => {
    expect(isRouteReachable("POST /contact/submit", gwRoutes)).toBe(true);
  });

  // ── True negatives: routes that should NOT be reachable ──

  it("wrong method is not reachable", () => {
    expect(isRouteReachable("DELETE /users/me", gwRoutes)).toBe(false);
  });

  it("unregistered base path is not reachable", () => {
    expect(isRouteReachable("GET /widgets/list", gwRoutes)).toBe(false);
  });

  it("GET /schools alone does not match via /{proxy+}", () => {
    // /schools/{proxy+} needs at least one more segment; /schools alone is
    // matched by the exact "GET /schools" entry
    expect(isRouteReachable("GET /schools", gwRoutes)).toBe(true); // via exact
  });

  it("missing DELETE /stats route is not reachable", () => {
    // No DELETE /stats route exists
    expect(isRouteReachable("DELETE /stats/{domain}", gwRoutes)).toBe(false);
  });
});
