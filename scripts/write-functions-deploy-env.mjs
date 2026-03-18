#!/usr/bin/env node
/**
 * Writes backend/functions/.env from process.env for whitelisted keys only.
 * Used by GitHub CD so all Cloud Functions secrets come from GitHub Actions secrets
 * (single source of truth), not ad-hoc Console edits.
 *
 * Run from repo root: node scripts/write-functions-deploy-env.mjs
 * Multiline values (e.g. PEM) work: stored in GH with real newlines, escaped here for dotenv.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TARGET = path.join(ROOT, "backend", "functions", ".env");

/** Env keys consumed by backend/functions (see grep process.env in src/) */
const KEYS = [
  "SENTRY_DSN",
  "SENTRY_RELEASE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM_EMAIL",
  "SMTP_FROM_NAME",
  "SUPER_ADMIN_EMAIL",
  "GOOGLE_CALENDAR_CLIENT_EMAIL",
  "GOOGLE_CALENDAR_PRIVATE_KEY",
  "GOOGLE_CALENDAR_ID",
  "ANTHROPIC_API_KEY",
];

function escapeDotenvValue(v) {
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

const lines = [];
for (const k of KEYS) {
  const v = process.env[k];
  if (v === undefined || v === "") continue;
  lines.push(`${k}="${escapeDotenvValue(v)}"`);
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
console.log(`write-functions-deploy-env: wrote ${lines.length} entries → ${TARGET}`);
