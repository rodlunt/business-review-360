/**
 * Phase 5 slice 5c (#867): 5-persona e2e for the main-domain org-less
 * ("bare domain") credentials login flow shipped by 5b (#868).
 *
 * The agreed flow (docs/AUTH_ONBOARDING_PLAN.md, Phase 5 Correction):
 *   Login -> credentials screen -> picker only if >1 org -> land -> review.
 *
 * Personas (scope locked on #867, 2026-05-19):
 *   1. Invited consultant: activation link -> set password -> land.
 *      Uses the existing consultant-invite mechanic (reuses the
 *      /reset-password?activation=1 auto-login path; see consultants.js).
 *      The activation token is injected onto a seeded consultant row at
 *      test time (the raw token is never returned by the API or stored
 *      unhashed; the route resolves users by sha256(token)).
 *   2. Multi-org: credentials -> pre-session picker -> land. Also asserts
 *      the post-session in-app picker does NOT re-appear (the App.jsx
 *      double-picker suppression).
 *   3. Single-org: credentials -> land, no picker.
 *   4. Self-serve via the login screen ("don't have an account").
 *      Phase 5 5d (#869) shipped org-less self-serve register: the
 *      backend resolves the shared self-serve org and issues a session
 *      directly (single membership -> no picker). Real test: switch ->
 *      fill -> submit -> land on review.
 *   5. Self-serve via "see it in action". The marketing /demo/ page is a
 *      lead-capture form (kept); the genuine no-account self-serve demo
 *      is the React DemoAccessPage, moved off the Hugo-shadowed /demo to
 *      /try (#872) with the "See it in action" CTAs repointed there.
 *      Full land asserted (post #878): submit -> ephemeral demo-corp
 *      session -> welcome modal -> /org/demo-corp/home. The demo-access
 *      route hard-requires a reCAPTCHA token (production-only safety);
 *      the e2e env sets RECAPTCHA_E2E_BYPASS_TOKEN and this test
 *      intercepts the demo-access POST to inject that sentinel value so
 *      verifyRecaptcha's env-gated bypass fires. PRODUCTION SAFETY: the
 *      bypass env var is never set in prod and the deploy workflow does
 *      not propagate it. See backend/src/lib/recaptcha.js for the gate.
 *   plus a negative / no-enumeration test (identical response for
 *   unknown-email vs wrong-password).
 *
 * Environment: the local Docker stack (playwright.config.js baseURL
 * http://localhost:3000). On localhost there is no subdomain and no
 * /org/:id param, so useOrganizationId() is falsy, AuthForm sets
 * orgLess=true, and bare /login renders the org-less credentials screen
 * (the 5b AppRoutes.jsx change). Fixtures come from
 * db/patches/multi-org-user-seed.sql (seeded by global-setup.js and
 * re-applied idempotently in beforeAll so this spec is order-independent
 * even if an earlier spec reset the database).
 *
 * reCAPTCHA: in orgLess mode LoginForm skips the per-tenant settings
 * fetch (LoginForm.jsx:66), so the org useCaptcha=false lever does NOT
 * apply and captchaEnabled stays true. We block the Google reCAPTCHA
 * script at the network layer so the library's executeRecaptcha stays
 * undefined; the `if (captchaEnabled && executeRecaptcha)` guard then
 * short-circuits, no token is sent, and the backend skips verification
 * (auth.js verifies only `if (recaptchaToken)`). Deterministic and
 * headless-safe.
 */
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_CONTAINER = "business-review-360-db-1";
const DB_USER = process.env.POSTGRES_USER || "business_review_user";
const APP_DB = "business_review_db";
const SEED_FILE = path.resolve(__dirname, "..", "..", "db", "patches", "multi-org-user-seed.sql");

const PASSWORD = "Password123!";
const CONSULTANT_USER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Run SQL against the app DB inside the Docker Postgres container. */
function appDbSql(sql) {
  return execSync(
    `docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${APP_DB} -v ON_ERROR_STOP=1`,
    { encoding: "utf-8", input: sql }
  );
}

/**
 * Re-apply the 5c canonical-identity seed. Idempotent (ON CONFLICT DO
 * NOTHING throughout) so it is safe even when global-setup already ran it
 * and safe if an earlier spec's reset-database wiped the rows.
 */
function reseedCanonicalIdentities() {
  execSync(`cat "${SEED_FILE}" | docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${APP_DB}`, {
    stdio: "pipe",
  });
}

// Predicate for page.waitForURL: the user has landed on review/home.
const onReviewOrHome = (url) =>
  /\/org\/[^/]+\/(review|home)(\/)?$/.test(url.pathname) ||
  /\/(review|home)(\/)?$/.test(url.pathname);

test.beforeAll(() => {
  reseedCanonicalIdentities();
});

test.beforeEach(async ({ context }) => {
  // Keep the org-less screen's reCAPTCHA dormant: with the script blocked,
  // react-google-recaptcha-v3 never resolves grecaptcha so executeRecaptcha
  // from the hook stays undefined and no token is ever sent.
  await context.route("**/recaptcha/**", (route) => route.abort());
});

/** Navigate to the bare-domain org-less credentials screen. */
async function gotoBareLogin(page) {
  await page.goto("/login");
  await page
    .locator('[data-testid="email"] input')
    .first()
    .waitFor({ state: "visible", timeout: 45000 });
  // The org-less hint is only rendered in orgLess mode (LoginForm.jsx);
  // its presence proves we are on the org-less screen, not the org-scoped
  // screen (both are email-keyed since #892, but only org-less renders
  // this hint).
  await expect(page.locator('[data-testid="orgless-email-hint"]')).toBeVisible();
}

async function submitCredentials(page, email, password) {
  await page.locator('[data-testid="email"] input').first().fill(email);
  await page.locator('[data-testid="password"] input').first().fill(password);
  await page.locator('[data-testid="submit-button"]').first().click();
}

/**
 * The Welcome modal renders only when a user session is set (it shows
 * every login by design, locked decision #7), so its appearance is a
 * reliable "authenticated and landed" proof. Dismiss it, then confirm the
 * URL is on review/home.
 */
async function dismissWelcomeAndExpectLanded(page) {
  await expect(page.locator('[data-testid="welcome-backdrop"]')).toBeVisible({ timeout: 30000 });
  await page.locator('[data-testid="welcome-continue"]').click();
  await page
    .locator('[data-testid="welcome-backdrop"]')
    .waitFor({ state: "hidden", timeout: 10000 });
  await page.waitForURL(onReviewOrHome, { timeout: 15000 });
}

test.describe('Phase 5 5c - org-less ("bare domain") login flow (#867)', () => {
  test("Persona 1: invited consultant - activation link -> set password -> land", async ({
    page,
  }) => {
    // Mint the activation token the way the consultant-invite flow does:
    // store sha256(rawToken) + a future expiry on the seeded consultant
    // row. The raw token is never persisted (route hashes on lookup), so
    // injecting the hash and driving the raw value is the faithful e2e.
    const rawToken = `e2e-5c-activation-${Date.now()}`;
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    appDbSql(
      `UPDATE "Users" SET "passwordResetToken"='${hashedToken}', ` +
        `"passwordResetExpires"=NOW() + INTERVAL '1 hour' WHERE id='${CONSULTANT_USER_ID}';`
    );

    await page.goto(`/reset-password?token=${rawToken}&activation=1`);

    const newPassword = "Activated123!";
    await page.locator('[data-testid="new-password"] input').first().fill(newPassword);
    await page.locator('[data-testid="confirm-new-password"] input').first().fill(newPassword);
    await page.locator('[data-testid="reset-password-submit"]').first().click();

    // Backend resets the password and auto-issues a session (auth.js
    // /reset-password). The form stores token+user immediately on success.
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 20000 });

    // The consultant has a single approved demo-corp membership, so the
    // session lands in demo-corp with no picker. Confirm the activated
    // session is usable: an authenticated org-app render, not a bounce
    // back to /login.
    await page.goto("/org/demo-corp/review");
    await dismissWelcomeAndExpectLanded(page);
    await expect(page.locator('[data-testid="email"] input')).toHaveCount(0);
  });

  test("Persona 2: multi-org - credentials -> pre-session picker -> land (no double picker)", async ({
    page,
  }) => {
    await gotoBareLogin(page);
    await submitCredentials(page, "multiorg@e2e.local", PASSWORD);

    // Pre-session picker: no session yet (pendingPick path in App.jsx).
    await expect(page.locator('[data-testid="org-picker-backdrop"]')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('[data-testid="org-option-demo-corp"]')).toBeVisible();
    await expect(page.locator('[data-testid="org-option-test-org-2"]')).toBeVisible();
    // No session minted at the picker stage, so no welcome modal yet.
    await expect(page.locator('[data-testid="welcome-backdrop"]')).toHaveCount(0);

    // Pick demo-corp explicitly. demo-corp is the seeded primary so
    // select-org's last-wins primary update is a no-op: the test stays
    // rerun-safe. Without this click there is NO session (pendingPick
    // carries no token), so a landed session proves the picker drove it.
    await page.locator('[data-testid="org-option-demo-corp"]').click();
    await page.locator('[data-testid="org-picker-continue"]').click();

    // loginWithPickToken mints the session -> welcome modal proves it.
    await dismissWelcomeAndExpectLanded(page);

    // Double-picker suppression (App.jsx re-assert effect, declared AFTER
    // the re-arm effect): the post-session in-app OrgPickerModal must NOT
    // re-appear after the pre-session pick. Assert absent and that it
    // stays absent through the commit/settle window.
    await expect(page.locator('[data-testid="org-picker-backdrop"]')).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-testid="org-picker-backdrop"]')).toHaveCount(0);
  });

  test("Persona 3: single-org - credentials -> land, no picker", async ({ page }) => {
    await gotoBareLogin(page);
    await submitCredentials(page, "singleorg@e2e.local", PASSWORD);

    // Single approved membership: the backend issues the org-scoped
    // session directly; the picker is never shown at any point.
    await expect(page.locator('[data-testid="welcome-backdrop"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="org-picker-backdrop"]')).toHaveCount(0);
    await dismissWelcomeAndExpectLanded(page);
  });

  test("Persona 4: self-serve via the login screen - register -> land (5d, #869)", async ({
    page,
  }) => {
    await gotoBareLogin(page);

    // "don't have an account": an in-place mode switch (no route change)
    // reveals RegisterForm. confirmPassword is register-distinct and
    // exists only in RegisterForm. The button's accessible name is its
    // aria-label ("Switch to registration form"), NOT the visible
    // "NEED AN ACCOUNT? REGISTER" text, so target the aria-label.
    await page.getByRole("button", { name: /switch to registration form/i }).click();
    await expect(page.locator('[data-testid="confirmPassword"] input').first()).toBeVisible({
      timeout: 10000,
    });
    // The org-less register hint proves RegisterForm is in orgLess mode.
    await expect(page.locator('[data-testid="orgless-register-hint"]')).toBeVisible();

    // Phase 5 5d (#869): org-less self-serve register now resolves the
    // shared self-serve org server-side and issues a session directly
    // (single membership -> no picker, like Persona 3). A unique email
    // per run keeps the forward global-email guard (409) from tripping on
    // a rerun against the same DB.
    //
    // testid occurrence map on the org-less auth screen (LoginForm +
    // RegisterForm both mounted, display-toggled). #892 register slice:
    // the username testid is gone entirely (RegisterForm no longer has
    // one) -- every other row is unaffected, since none of their counts
    // depended on username's presence.
    //   email          -> LoginForm[0], RegisterForm[1] -> nth(1)
    //   password       -> LoginForm[0], RegisterForm[1] -> nth(1)
    //   confirmPassword-> RegisterForm only           -> first()
    //   submit-button  -> LoginForm[0], RegisterForm[1] -> nth(1)
    const stamp = Date.now();
    await page.locator('[data-testid="email"] input').nth(1).fill(`selfserve_${stamp}@e2e.local`);
    await page.locator('[data-testid="password"] input').nth(1).fill(PASSWORD);
    await page.locator('[data-testid="confirmPassword"] input').first().fill(PASSWORD);
    await page.locator('[data-testid="submit-button"]').nth(1).click();

    // Session minted directly: welcome modal proves it, picker never shows
    // (the self-serve org is the user's single approved membership).
    await dismissWelcomeAndExpectLanded(page);
    await expect(page.locator('[data-testid="org-picker-backdrop"]')).toHaveCount(0);
  });

  test('Persona 5: self-serve via "see it in action" - React DemoAccessPage at /try lands a demo session (#872 + #878)', async ({
    page,
    context,
  }) => {
    // #872 deliverable + #878 land. The SPA DemoAccessPage moved off the
    // Hugo-shadowed /demo to /try; reaching it proves the shadow is gone.
    // The full submit -> demo-corp session land was previously deferred
    // because /billing/demo-access hard-requires a reCAPTCHA token and the
    // suite-wide network block on `**/recaptcha/**` leaves executeRecaptcha
    // undefined. #878 added an env-gated backend bypass: when
    // RECAPTCHA_E2E_BYPASS_TOKEN is set AND the incoming token equals it,
    // verifyRecaptcha returns synthetic success. The e2e workflow sets the
    // env; here we intercept the form's POST and rewrite the (null) token
    // to the sentinel so the backend bypass fires.
    const BYPASS_TOKEN = "e2e-test-recaptcha-token-do-not-use-in-prod";
    // Regex (not glob) because DemoAccessPage's POST goes via the shared
    // api client which appends `?clientId=<uuid>` for tracing - a
    // `**/api/billing/demo-access` glob doesn't match the trailing query
    // string and the intercept silently never fires. The backend then
    // short-circuits with 400 RECAPTCHA_REQUIRED before verifyRecaptcha
    // can run the bypass. Only pass `postData` to continue() so Playwright
    // auto-updates content-length and inherits the rest of the request.
    await context.route(/\/api\/billing\/demo-access/, async (route) => {
      let body = {};
      try {
        body = route.request().postDataJSON() || {};
      } catch {
        body = {};
      }
      body.recaptchaToken = BYPASS_TOKEN;
      await route.continue({ postData: JSON.stringify(body) });
    });

    await page.goto("/try");
    await expect(page.getByRole("heading", { name: /try business review 360/i })).toBeVisible();
    const demoEmail = page.getByRole("textbox", { name: /email address/i });
    await expect(demoEmail).toBeVisible();

    await demoEmail.fill(`demo5c_${Date.now()}@e2e.local`);
    await page.getByRole("button", { name: /start demo/i }).click();

    // Genuine land: DemoAccessPage navigates to /org/demo-corp/home on
    // success; the welcome modal then appears as on any fresh session.
    await dismissWelcomeAndExpectLanded(page);
    // Confirm the URL actually lands inside the demo org.
    expect(page.url()).toMatch(/demo-corp/);
  });

  test("Negative: no user/email enumeration (identical response for unknown vs wrong password)", async ({
    page,
  }) => {
    // (a) Unknown email.
    await gotoBareLogin(page);
    await submitCredentials(page, `nobody_${Date.now()}@e2e.local`, "whatever-Password1!");
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 15000 });
    const unknownEmailError = (
      await page.locator('[data-testid="error-message"]').innerText()
    ).trim();
    // No session, no navigation: still on the credentials screen.
    await expect(page.locator('[data-testid="email"] input').first()).toBeVisible();
    await expect(page.locator('[data-testid="welcome-backdrop"]')).toHaveCount(0);

    // (b) Known email, wrong password.
    await gotoBareLogin(page);
    await submitCredentials(page, "singleorg@e2e.local", "definitely-Wrong1!");
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 15000 });
    const wrongPasswordError = (
      await page.locator('[data-testid="error-message"]').innerText()
    ).trim();
    await expect(page.locator('[data-testid="email"] input').first()).toBeVisible();
    await expect(page.locator('[data-testid="welcome-backdrop"]')).toHaveCount(0);

    // Byte-identical: the UI must not disclose whether the account exists.
    expect(wrongPasswordError).toBe(unknownEmailError);
    expect(unknownEmailError).toBe("Invalid credentials");
  });
});
