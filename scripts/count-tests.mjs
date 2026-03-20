#!/usr/bin/env node
/**
 * Count unit and integration tests from Vitest/Jest-style test files.
 * Integration: path contains "integration" or filename contains ".integration.test."
 * Unit: all other tests.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const frontend = join(root, "frontend", "src");
const backend = join(root, "backend", "functions", "src");

function findTestFiles(dir, base = dir) {
  const results = [];
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        results.push(...findTestFiles(full, base));
      } else if (ent.name.match(/\.test\.(ts|tsx)$/)) {
        results.push(relative(base, full));
      }
    }
  } catch (_) {
    // ignore missing dirs
  }
  return results;
}

function collectTestFiles(dir) {
  return findTestFiles(dir, dir);
}

function countTests(absolutePath) {
  let content;
  try {
    content = readFileSync(absolutePath, "utf8");
  } catch {
    return 0;
  }
  const itMatches = content.match(/\bit\s*\(/g);
  const testMatches = content.match(/\btest\s*\(/g);
  return (itMatches?.length ?? 0) + (testMatches?.length ?? 0);
}

function isIntegration(pathOrName) {
  const p = pathOrName.replace(/\\/g, "/");
  return p.includes("integration") || p.includes(".integration.test.");
}

let unit = 0;
let integration = 0;

for (const rel of collectTestFiles(frontend)) {
  const full = join(frontend, rel);
  const n = countTests(full);
  if (isIntegration(rel)) integration += n;
  else unit += n;
}

for (const rel of collectTestFiles(backend)) {
  const full = join(backend, rel);
  const n = countTests(full);
  if (isIntegration(rel)) integration += n;
  else unit += n;
}

const total = unit + integration;
console.log("Unit tests:       ", unit);
console.log("Integration tests:", integration);
console.log("Total tests:      ", total);
