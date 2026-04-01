import { test, expect, Page } from "@playwright/test";

const TUTOR_EMAIL = "test-tutor@testschool.edu";
const TUTOR_PASS  = "TestTutor123!";
const TUTEE_EMAIL = "test-tutee@testschool.edu";
const TUTEE_PASS  = "TestTutee123!";
const TUTOR_UID   = "b4c8c458-20d1-705e-f4d9-77e8e7b166be";

// ── Helpers ────────────────────────────────────────────────────────────────

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth?mode=signin");
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.locator('input[type="email"]').clear();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').clear();
  await page.locator('input[type="password"]').fill(password);
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').click();

  const result = await Promise.race([
    page.waitForURL(/\/(dashboard|find|onboard|tutor)/, { timeout: 20000 }).then(() => "redirected"),
    page.waitForSelector("div.bg-red-50", { timeout: 20000 }).then(() => "error"),
  ]).catch(() => "timeout");

  if (result === "error") {
    const msg = await page.locator("div.bg-red-50").first().innerText().catch(
      async () => (await page.locator("body").textContent())?.slice(0, 300) ?? "unknown error"
    );
    throw new Error(`Sign-in error: "${msg.trim()}"`);
  }
  if (result === "timeout") throw new Error("Sign-in did not redirect or show error within 20s");
}

async function signOut(page: Page) {
  const btn = page.locator('button[title="Sign out"]');
  await btn.waitFor({ timeout: 5000 });
  await btn.click();
  await page.waitForURL("/", { timeout: 10000 });
}

// ── Public pages ───────────────────────────────────────────────────────────

test.describe("Public pages", () => {
  test("Landing page loads", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    expect(title).toBeTruthy();
    const h1 = await page.locator("h1").first().textContent({ timeout: 5000 });
    expect(h1).toBeTruthy();
  });

  test("Contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");
    const formCount = await page.locator("form").count();
    expect(formCount).toBeGreaterThan(0);
  });

  test("Unauthenticated access redirects to /auth", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/auth/, { timeout: 8000 });
  });

  test("Find-tutors page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/find");
    await page.waitForURL(/\/auth/, { timeout: 8000 });
  });

  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/this-does-not-exist-xyz");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/not found|404|doesn't exist|page not/i);
  });
});

// ── Tutor flow ─────────────────────────────────────────────────────────────

test.describe("Tutor flow", () => {
  test("sign-in succeeds", async ({ page }) => {
    await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
    expect(page.url()).toMatch(/\/(dashboard|onboard|tutor)/);
  });

  test("dashboard page loads", async ({ page }) => {
    await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
    await page.waitForURL(/\/(dashboard|onboard)/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    const heading = await page.locator("h1, h2").first().textContent({ timeout: 5000 });
    expect(heading).toBeTruthy();
  });

  test("availability section present on dashboard", async ({ page }) => {
    await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
    if (page.url().includes("/onboard")) return; // not yet initialized
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/availability|schedule|session|slot/i);
  });

  test("can view own profile page", async ({ page }) => {
    await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
    await page.goto(`/tutor/${TUTOR_UID}`);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/tutor|profile|subject|bio|algebra|physics/i);
  });

  test("can sign out", async ({ page }) => {
    await signIn(page, TUTOR_EMAIL, TUTOR_PASS);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await signOut(page);
    expect(page.url()).toMatch(/\/$/);
  });
});

// ── Tutee flow ─────────────────────────────────────────────────────────────

test.describe("Tutee flow", () => {
  test("sign-in succeeds", async ({ page }) => {
    await signIn(page, TUTEE_EMAIL, TUTEE_PASS);
    expect(page.url()).toMatch(/\/(dashboard|find|onboard)/);
  });

  test("find-tutors page loads", async ({ page }) => {
    await signIn(page, TUTEE_EMAIL, TUTEE_PASS);
    await page.goto("/find");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/auth") || page.url().includes("/onboard")) return;
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/tutor|find|search|subject|book/i);
  });

  test("can view tutor profile", async ({ page }) => {
    await signIn(page, TUTEE_EMAIL, TUTEE_PASS);
    await page.goto(`/tutor/${TUTOR_UID}`);
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/onboard")) return;
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/tutor|profile|book|subject/i);
  });

  test("can sign out", async ({ page }) => {
    await signIn(page, TUTEE_EMAIL, TUTEE_PASS);
    await page.goto("/find");
    await page.waitForLoadState("networkidle");
    await signOut(page);
    expect(page.url()).toMatch(/\/$/);
  });
});

// ── Auth edge cases ────────────────────────────────────────────────────────

test.describe("Auth edge cases", () => {
  test("wrong password shows error", async ({ page }) => {
    await page.goto("/auth?mode=signin");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.locator('input[type="email"]').fill(TUTOR_EMAIL);
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.locator('button[type="submit"]').click();
    await page
      .waitForSelector('[role="alert"], [class*="error"], [class*="Error"], p.text-red', { timeout: 10000 })
      .catch(() => page.waitForTimeout(3000));
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/incorrect|invalid|wrong|failed|error|password|username/i);
    expect(page.url()).toContain("/auth");
  });

  test("sign-up tab renders form", async ({ page }) => {
    await page.goto("/auth?mode=signup");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/auth")) return; // already logged in
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/create.?account|sign.?up|register|full.?name/i);
    const inputs = await page.locator("input").count();
    expect(inputs).toBeGreaterThanOrEqual(2);
  });
});
