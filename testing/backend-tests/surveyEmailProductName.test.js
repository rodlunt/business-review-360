/**
 * #897 - SatisfactionSurvey + SurveyThankYou emails target the
 * Business Review 360 product, not the user's tenant.
 *
 * The /feedback SPA page hardcodes "Business Review 360" in its
 * question text. Pre-fix, the email subject + body interpolated
 * `branding.organizationName` (the user's tenant), producing nonsense
 * for the public demo-corp sandbox ("How is demo corp working for
 * you?"). Tenant branding stays on the Header/Footer visual chrome
 * (logo + colour) - only the survey-question text is hardcoded.
 *
 * These are source-grep assertions, not render-time assertions:
 * Jest's `moduleNameMapper` rewrites every `.jsx` import to
 * react/jsx-runtime (see backend/package.json and the email-template
 * mock gotcha in the br360-gotchas skill), so a runtime render of the actual
 * template is not feasible from this suite. The grep checks both
 * positively (the hardcoded string is present) and negatively (the
 * bug pattern `${organizationName}` in the wrong place is gone) so
 * a partial revert is caught.
 */
import { describe, it, expect } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

async function read(rel) {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf8");
}

describe("#897 satisfaction-survey emails hardcode the product name", () => {
  it("survey subject hardcodes Business Review 360, not the tenant org name", async () => {
    const src = await read("backend/src/services/engagementEmailService.js");
    expect(src).toContain("Quick question: How is Business Review 360 working for you?");
    expect(src).not.toMatch(/Quick question: How is \$\{[^}]+\.organizationName\}/);
  });

  it("thank-you subject hardcodes Business Review 360, not the tenant org name", async () => {
    const src = await read("backend/src/services/engagementEmailService.js");
    expect(src).toContain("Thank you for your feedback - Business Review 360");
    expect(src).not.toMatch(/Thank you for your feedback - \$\{[^}]+\.organizationName\}/);
  });

  it("SatisfactionSurvey template body hardcodes the product name", async () => {
    const src = await read("backend/src/emails/templates/engagement/SatisfactionSurvey.jsx");
    expect(src).toContain("How is Business Review 360 working for you?");
    expect(src).toContain("How satisfied are you with Business Review 360?");
    expect(src).toContain("your experience has been with Business Review 360");
    // Negative checks: the prior bug pattern is gone.
    expect(src).not.toMatch(/How is \$\{organizationName\}/);
    expect(src).not.toMatch(/How satisfied are you with \{organizationName\}\?/);
    expect(src).not.toMatch(/your experience has been with \{organizationName\}/);
  });

  it("SurveyThankYou template preview hardcodes the product name", async () => {
    const src = await read("backend/src/emails/templates/engagement/SurveyThankYou.jsx");
    expect(src).toContain("Thank you for your feedback about Business Review 360!");
    expect(src).not.toMatch(/Thank you for your feedback about \$\{organizationName\}/);
  });

  it("Header components in both templates keep organizationName for tenant visual branding", async () => {
    // Tenant logo + colour MUST still flow via the Header/Footer. Only
    // the survey-question text changes - chrome stays per-tenant.
    const survey = await read("backend/src/emails/templates/engagement/SatisfactionSurvey.jsx");
    const thanks = await read("backend/src/emails/templates/engagement/SurveyThankYou.jsx");
    expect(survey).toMatch(/Header[\s\S]*?organizationName=\{organizationName\}/);
    expect(thanks).toMatch(/Header[\s\S]*?organizationName=\{organizationName\}/);
  });

  it("QA script send-all-templates.mjs links to /feedback, not the stale /survey route", async () => {
    const src = await read("backend/scripts/send-all-templates.mjs");
    expect(src).toContain("https://br360.example.com/feedback?token=abc123");
    expect(src).not.toContain("https://br360.example.com/survey?token=abc123");
  });
});
