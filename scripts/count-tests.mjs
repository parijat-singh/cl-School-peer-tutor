#!/usr/bin/env node
/**
 * Count all automated tests and update the README test-count badge section.
 *
 * Categories:
 *   Unit        — *.test.ts(x), excluding *.integration.test.*
 *   Integration — *.integration.test.ts(x)
 *   E2E         — e2e/**\/*.spec.ts (Playwright)
 *
 * Updates README.md between <!-- TEST-COUNT-START --> and <!-- TEST-COUNT-END -->.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

// ── File discovery ─────────────────────────────────────────────────────────

function walk(dir, ext) {
  const results = [];
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== "node_modules") {
        results.push(...walk(full, ext));
      } else if (ext.test(ent.name)) {
        results.push(full);
      }
    }
  } catch (_) {
    // ignore missing dirs
  }
  return results;
}

// ── Test counter ───────────────────────────────────────────────────────────

function countTests(filePath) {
  try {
    const src = readFileSync(filePath, "utf8");
    return (src.match(/\bit\s*\(/g)?.length ?? 0) + (src.match(/\btest\s*\(/g)?.length ?? 0);
  } catch {
    return 0;
  }
}

// ── Collect by category ────────────────────────────────────────────────────

const vitestExt = /\.test\.(ts|tsx)$/;
const playwrightExt = /\.spec\.ts$/;

const vitest = [
  ...walk(join(root, "frontend", "src"), vitestExt),
  ...walk(join(root, "backend", "lambdas", "src"), vitestExt),
];

const e2eFiles = walk(join(root, "e2e"), playwrightExt);

let unit = 0;
let integration = 0;

for (const f of vitest) {
  const rel = relative(root, f).replace(/\\/g, "/");
  const n = countTests(f);
  if (rel.includes(".integration.test.")) integration += n;
  else unit += n;
}

let e2e = 0;
for (const f of e2eFiles) {
  e2e += countTests(f);
}

const total = unit + integration + e2e;

// ── Console output ─────────────────────────────────────────────────────────

console.log(`Unit tests:        ${unit}`);
console.log(`Integration tests: ${integration}`);
console.log(`E2E tests:         ${e2e}`);
console.log(`Total:             ${total}`);

// ── README update ──────────────────────────────────────────────────────────

const readmePath = join(root, "README.md");
let readme;
try {
  readme = readFileSync(readmePath, "utf8");
} catch {
  console.error("README.md not found — skipping update");
  process.exit(0);
}

const block = `<!-- TEST-COUNT-START -->
| Test type | Count |
|---|---|
| Unit | ${unit} |
| Integration | ${integration} |
| E2E (Playwright) | ${e2e} |
| **Total** | **${total}** |
<!-- TEST-COUNT-END -->`;

const updated = readme.replace(
  /<!-- TEST-COUNT-START -->[\s\S]*?<!-- TEST-COUNT-END -->/,
  block
);

if (updated === readme) {
  console.warn("Warning: <!-- TEST-COUNT-START/END --> markers not found in README.md");
} else {
  writeFileSync(readmePath, updated, "utf8");
  console.log("\nREADME.md updated.");
}
