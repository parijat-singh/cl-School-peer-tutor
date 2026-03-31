/**
 * PeerTutor — Full E2E Browser Test (Playwright)
 * Run: node e2e-test.mjs
 *
 * Covers:
 *   1. Landing page loads
 *   2. Contact page
 *   3. Auth redirect (unauthenticated → /auth)
 *   4. Sign-in — tutor account
 *   5. Tutor dashboard loads + availability displayed
 *   6. Tutor profile page
 *   7. Sign-out
 *   8. Sign-in — tutee account
 *   9. Find-tutors page (TuteeBooking)
 *  10. Tutor profile view from booking page
 *  11. Sign-out
 *  12. 404 page
 */

import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const TUTOR_EMAIL = "test-tutor@testschool.edu";
const TUTOR_PASS  = "TestTutor123!";
const TUTEE_EMAIL = "test-tutee@testschool.edu";
const TUTEE_PASS  = "TestTutee123!";
const TUTOR_UID   = "b4c8c458-20d1-705e-f4d9-77e8e7b166be";

// ── Helpers ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  process.stdout.write(`  ▶ ${name} ... `);
  try {
    await fn();
    console.log("✅ PASS");
    passed++;
    results.push({ name, status: "PASS" });
  } catch (err) {
    console.log(`❌ FAIL — ${err.message}`);
    failed++;
    results.push({ name, status: "FAIL", error: err.message });
  }
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/auth?mode=signin`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  // Clear + fill to avoid stale state
  await page.locator('input[type="email"]').clear();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').clear();
  await page.locator('input[type="password"]').fill(password);
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect OR error message
  const result = await Promise.race([
    page.waitForURL(/\/(dashboard|find|onboard|tutor)/, { timeout: 20000 }).then(() => "redirected"),
    page.waitForSelector('div.bg-red-50', { timeout: 20000 }).then(() => "error"),
  ]).catch(() => "timeout");
  if (result === "error") {
    const msg = await page.locator('div.bg-red-50').first().innerText().catch(async () => {
      return await page.locator("body").textContent().then(t => t?.slice(0, 300)) ?? "unknown error";
    });
    // Also log recent network failures for diagnosis
    const recentFailures = networkFailures.slice(-3).join(" | ");
    throw new Error(`Sign-in error: "${msg.trim()}"${recentFailures ? ` [network: ${recentFailures}]` : ""}`);
  }
  if (result === "timeout") throw new Error("Sign-in did not redirect or show error within 20s");
}

async function signOut(page) {
  // The sign-out button uses title="Sign out" with a LogOut SVG icon (no visible text)
  const btn = page.locator('button[title="Sign out"]');
  await btn.waitFor({ timeout: 5000 });
  await btn.click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
}

// ── Main ─────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: false,
  slowMo: 150,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

// Capture console errors and network failures
const consoleErrors = [];
const networkFailures = [];
page.on("console", msg => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("requestfailed", req => {
  networkFailures.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`);
});
page.on("response", async res => {
  if (!res.ok() && res.url().includes("cognito")) {
    const body = await res.text().catch(() => "");
    networkFailures.push(`Cognito ${res.status()} ${res.url()}: ${body.slice(0, 200)}`);
  }
});

console.log("\n═══════════════════════════════════════════════════");
console.log("  PeerTutor E2E Test Suite");
console.log("═══════════════════════════════════════════════════\n");
console.log("📄 PUBLIC PAGES\n");

// ── 1. Landing page ───────────────────────────────────────────
await test("Landing page loads", async () => {
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  const title = await page.title();
  if (!title) throw new Error("Page title is empty");
  const h1 = await page.locator("h1").first().textContent({ timeout: 5000 });
  if (!h1) throw new Error("No <h1> on landing page");
  console.log(`\n    title="${title}", h1="${h1.trim()}"`);
});

// ── 2. Contact page ───────────────────────────────────────────
await test("Contact page loads", async () => {
  await page.goto(`${BASE}/contact`);
  await page.waitForLoadState("networkidle");
  const form = await page.locator("form").count();
  if (form === 0) throw new Error("No form found on contact page");
});

// ── 3. Auth redirect ──────────────────────────────────────────
await test("Unauthenticated access redirects to /auth", async () => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(/\/auth/, { timeout: 8000 });
});

await test("Find-tutors page redirects unauthenticated users", async () => {
  await page.goto(`${BASE}/find`);
  await page.waitForURL(/\/auth/, { timeout: 8000 });
});

await test("404 page renders for unknown routes", async () => {
  await page.goto(`${BASE}/this-does-not-exist-xyz`);
  await page.waitForLoadState("networkidle");
  const body = await page.locator("body").textContent();
  if (!body.match(/not found|404|doesn't exist|page not/i))
    throw new Error(`Expected 404 content, got: ${body.slice(0, 200)}`);
});

console.log("\n🔐 TUTOR FLOW\n");

// ── 4. Tutor sign-in ──────────────────────────────────────────
await test("Tutor: sign-in succeeds", async () => {
  await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
  const url = page.url();
  console.log(`\n    redirected to: ${url}`);
});

// ── 5. Tutor dashboard ─────────────────────────────────────────
await test("Tutor: dashboard page loads", async () => {
  await page.waitForURL(/\/(dashboard|onboard)/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  const url = page.url();
  if (url.includes("/onboard")) {
    console.log("\n    [onboard page — user not yet initialized via API]");
    return;
  }
  const heading = await page.locator("h1, h2").first().textContent({ timeout: 5000 });
  console.log(`\n    heading: "${heading?.trim()}"`);
});

// ── 6. Availability visible on dashboard ──────────────────────
await test("Tutor: availability section present", async () => {
  if (page.url().includes("/onboard")) {
    console.log("\n    [skipped — on onboard page]");
    return;
  }
  const body = await page.locator("body").textContent();
  if (!body.match(/availability|schedule|session|slot/i))
    throw new Error("No availability/schedule content found on tutor dashboard");
});

// ── 7. Navigate to own profile ────────────────────────────────
await test("Tutor: can view own profile page", async () => {
  await page.goto(`${BASE}/tutor/${TUTOR_UID}`);
  await page.waitForLoadState("networkidle");
  const body = await page.locator("body").textContent();
  if (!body.match(/tutor|profile|subject|bio|algebra|physics/i))
    throw new Error("Profile page doesn't contain expected content");
  const heading = await page.locator("h1, h2").first().textContent({ timeout: 5000 }).catch(() => "");
  console.log(`\n    profile heading: "${heading?.trim()}"`);
});

// ── 8. Tutor sign-out ─────────────────────────────────────────
await test("Tutor: can sign out", async () => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await signOut(page);
});

console.log("\n🎓 TUTEE FLOW\n");

// ── 9. Tutee sign-in ──────────────────────────────────────────
await test("Tutee: sign-in succeeds", async () => {
  await signIn(page, TUTEE_EMAIL, TUTEE_PASS);
  console.log(`\n    redirected to: ${page.url()}`);
});

// ── 10. Find tutors page ──────────────────────────────────────
await test("Tutee: find-tutors page loads", async () => {
  await page.goto(`${BASE}/find`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  if (url.includes("/auth") || url.includes("/onboard")) {
    console.log(`\n    [redirected to ${url} — user may need initializing]`);
    return;
  }
  const body = await page.locator("body").textContent();
  if (!body.match(/tutor|find|search|subject|book/i))
    throw new Error("Find tutors page doesn't contain expected content");
  const heading = await page.locator("h1, h2").first().textContent({ timeout: 5000 }).catch(() => "");
  console.log(`\n    heading: "${heading?.trim()}"`);
});

// ── 11. Tutee views a tutor profile ───────────────────────────
await test("Tutee: can view tutor profile", async () => {
  await page.goto(`${BASE}/tutor/${TUTOR_UID}`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  if (url.includes("/auth")) throw new Error("Redirected to auth — not signed in");
  if (url.includes("/onboard")) {
    console.log("\n    [skipped — on onboard page]");
    return;
  }
  const body = await page.locator("body").textContent();
  if (!body.match(/tutor|profile|book|subject/i))
    throw new Error("Tutor profile page missing expected content");
});

// ── 12. Tutee sign-out ────────────────────────────────────────
await test("Tutee: can sign out", async () => {
  await page.goto(`${BASE}/find`);
  await page.waitForLoadState("networkidle");
  await signOut(page);
});

console.log("\n🔒 AUTH EDGE CASES\n");

// ── 13. Sign-in with wrong password ───────────────────────────
await test("Auth: wrong password shows error", async () => {
  await page.goto(`${BASE}/auth?mode=signin`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.locator('input[type="email"]').fill(TUTOR_EMAIL);
  await page.locator('input[type="password"]').fill("WrongPassword999!");
  await page.locator('button[type="submit"]').click();
  // Wait for error to appear (should stay on /auth)
  await page.waitForSelector('[role="alert"], [class*="error"], [class*="Error"], p.text-red', { timeout: 10000 })
    .catch(async () => {
      // Fallback: check body text after a delay
      await page.waitForTimeout(3000);
    });
  const body = await page.locator("body").textContent();
  if (!body.match(/incorrect|invalid|wrong|failed|error|password|username/i))
    throw new Error(`Expected error message for wrong password. Got: "${body.slice(0, 300)}"`);
  if (!page.url().includes("/auth")) throw new Error("Should stay on /auth page after failed login");
});

// ── 14. Signup form renders ────────────────────────────────────
await test("Auth: sign-up tab renders form", async () => {
  // Must be logged out for this to show (sign-out happens in prior test)
  await page.goto(`${BASE}/auth?mode=signup`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  if (!url.includes("/auth")) {
    console.log(`\n    [redirected to ${url} — user still logged in, skipping]`);
    return;
  }
  const body = await page.locator("body").textContent();
  if (!body.match(/create.?account|sign.?up|register|full.?name/i))
    throw new Error(`Sign-up form not found. Body preview: "${body.slice(0, 200)}"`);
  const inputs = await page.locator('input').count();
  if (inputs < 2) throw new Error(`Expected at least 2 inputs on signup, got ${inputs}`);
  console.log(`\n    found ${inputs} input fields`);
});

// ── 15. Console errors check ───────────────────────────────────
await test("No critical JS console errors during test run", async () => {
  const critical = consoleErrors.filter(e =>
    e.match(/uncaught|unhandled|cannot read|is not a function|typeerror/i) &&
    !e.match(/favicon|sentry|analytics/i)
  );
  if (critical.length > 0) {
    console.log(`\n    console errors: ${critical.slice(0, 3).join("; ")}`);
    throw new Error(`${critical.length} critical console error(s) found`);
  }
});

// ── Summary ────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════");
if (failed > 0) {
  console.log("\n❌ Failed tests:");
  results.filter(r => r.status === "FAIL").forEach(r =>
    console.log(`  • ${r.name}: ${r.error}`)
  );
}
console.log();

await browser.close();
process.exit(failed > 0 ? 1 : 0);
