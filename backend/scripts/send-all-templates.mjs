/**
 * send-all-templates.mjs
 *
 * Sends one of every email template to a target address for visual QA.
 * Run from backend/ with:
 *   node --import esbuild-esm-loader/register scripts/send-all-templates.mjs you@example.com
 *
 * Uses the live RESEND_API_KEY from .env — do NOT run in production against
 * real user addresses. This is a one-shot QA tool.
 */
/* eslint-disable no-console */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
// .env lives at the repo root (one level up from backend/)
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });
import { sendTemplateEmail } from "../src/emails/utils/sendEmail.js";

import { VerifyEmail } from "../src/emails/templates/auth/VerifyEmail.jsx";
import { Welcome } from "../src/emails/templates/auth/Welcome.jsx";
import { PasswordReset } from "../src/emails/templates/auth/PasswordReset.jsx";
import { PasswordChanged } from "../src/emails/templates/auth/PasswordChanged.jsx";
import { UserAccountApproved } from "../src/emails/templates/auth/UserAccountApproved.jsx";
import { AdminUserPendingApproval } from "../src/emails/templates/auth/AdminUserPendingApproval.jsx";
import { TeamInviteEmail } from "../src/emails/templates/auth/TeamInviteEmail.jsx";

import { NewIdeaSubmitted } from "../src/emails/templates/admin/NewIdeaSubmitted.jsx";
import { DailyIdeaDigest } from "../src/emails/templates/admin/DailyIdeaDigest.jsx";
import { IdeasNeedAttention } from "../src/emails/templates/admin/IdeasNeedAttention.jsx";
import { SalesNotification } from "../src/emails/templates/admin/SalesNotification.jsx";
import { DemoLeadCapture } from "../src/emails/templates/admin/DemoLeadCapture.jsx";

import { ConsultantInviteEmail } from "../src/emails/templates/consultants/ConsultantInviteEmail.jsx";
import { ConsultantWelcomeEmail } from "../src/emails/templates/consultants/ConsultantWelcomeEmail.jsx";
import { ConsultantAccessGrantedEmail } from "../src/emails/templates/consultants/ConsultantAccessGrantedEmail.jsx";
import { ConsultantAccessDeclinedEmail } from "../src/emails/templates/consultants/ConsultantAccessDeclinedEmail.jsx";
import { ConsultantMonthlyStatementEmail } from "../src/emails/templates/consultants/ConsultantMonthlyStatementEmail.jsx";

import { WeeklyUserSummary } from "../src/emails/templates/digest/WeeklyUserSummary.jsx";
import { MonthlyAdminSummary } from "../src/emails/templates/digest/MonthlyAdminSummary.jsx";
import { QuarterlyReport } from "../src/emails/templates/digest/QuarterlyReport.jsx";

import { SatisfactionSurvey } from "../src/emails/templates/engagement/SatisfactionSurvey.jsx";
import { SurveyThankYou } from "../src/emails/templates/engagement/SurveyThankYou.jsx";
import { InactiveUserReengagement } from "../src/emails/templates/engagement/InactiveUserReengagement.jsx";

import { CommentOnIdea } from "../src/emails/templates/notifications/CommentOnIdea.jsx";
import { CommentReply } from "../src/emails/templates/notifications/CommentReply.jsx";
import { IdeaImplemented } from "../src/emails/templates/notifications/IdeaImplemented.jsx";
import { StatusChange } from "../src/emails/templates/notifications/StatusChange.jsx";
import { TrialWelcome } from "../src/emails/templates/notifications/TrialWelcome.jsx";
import { TrialReminder } from "../src/emails/templates/notifications/TrialReminder.jsx";
import { TrialExpired } from "../src/emails/templates/notifications/TrialExpired.jsx";
import { SubscriptionCancelled } from "../src/emails/templates/notifications/SubscriptionCancelled.jsx";
import { PaymentFailed } from "../src/emails/templates/notifications/PaymentFailed.jsx";

const to = process.argv[2];
if (!to) {
  console.error("Usage: node scripts/send-all-templates.mjs <email>");
  process.exit(1);
}

const ORG = "Demo Corp";
const COLOR = "#1976d2";
const APP = "https://demo-corp.br360.example.com";
const IDEA_URL = `${APP}/idea/digital-pest-tracking-12345`;

const templates = [
  // --- Auth ---
  {
    name: "VerifyEmail",
    subject: "[QA] Verify your email address",
    template: VerifyEmail,
    props: {
      userName: "Rodney",
      verificationUrl: `${APP}/verify?token=abc123xyz`,
      verificationCode: "847291",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      expirationHours: 24,
    },
  },
  {
    name: "Welcome",
    subject: "[QA] Welcome to Business Review 360",
    template: Welcome,
    props: {
      userName: "Rodney",
      organizationName: ORG,
      organizationId: "demo-corp",
      primaryColor: COLOR,
      logoUrl: null,
      loginUrl: `${APP}/login`,
      ideasUrl: `${APP}/ideas`,
      adminEmail: "admin@democorp.com",
    },
  },
  {
    name: "PasswordReset",
    subject: "[QA] Reset your password",
    template: PasswordReset,
    props: {
      userName: "Rodney",
      resetUrl: `${APP}/reset-password?token=abc123xyz`,
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      expirationMinutes: 60,
    },
  },
  {
    name: "TeamInviteEmail",
    subject: "[QA] Demo Corp has signed you up",
    template: TeamInviteEmail,
    props: {
      userName: "rodney",
      organizationName: ORG,
      resetUrl: `${APP}/org/demo-corp/reset-password?token=abc123xyz`,
      primaryColor: COLOR,
      logoUrl: null,
      expirationMinutes: 2880,
    },
  },
  {
    name: "PasswordChanged",
    subject: "[QA] Your password has been changed",
    template: PasswordChanged,
    props: {
      userName: "Rodney",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      changeTimestamp: new Date().toISOString(),
      resetUrl: `${APP}/forgot-password`,
      adminEmail: "admin@democorp.com",
    },
  },
  {
    name: "UserAccountApproved",
    subject: "[QA] Your account has been approved",
    template: UserAccountApproved,
    props: {
      userName: "Rodney",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      loginUrl: `${APP}/login`,
      ideasUrl: `${APP}/ideas`,
    },
  },
  {
    name: "AdminUserPendingApproval",
    subject: "[QA] New user pending approval",
    template: AdminUserPendingApproval,
    props: {
      adminName: "Rodney",
      newUserName: "jsmith",
      newUserEmail: "jsmith@democorp.com",
      registeredAt: new Date().toISOString(),
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      adminUrl: `${APP}/admin/users`,
    },
  },

  // --- Admin ---
  {
    name: "NewIdeaSubmitted",
    subject: "[QA] New idea submitted",
    template: NewIdeaSubmitted,
    props: {
      adminName: "Rodney",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaDescription:
        "Develop a mobile app for technicians to log pest activity in real-time during inspections. Include photo uploads, GPS coordinates, and species identification.",
      ideaUrl: IDEA_URL,
      authorName: "Stewart Paterson",
      category: "Technology",
      priority: "High",
      timeSavedMinutes: 25,
      impactScore: 8,
      effortScore: 6,
      submittedAt: new Date().toISOString(),
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "DailyIdeaDigest",
    subject: "[QA] Daily idea digest",
    template: DailyIdeaDigest,
    props: {
      adminName: "Rodney",
      ideas: [
        { title: "Pest ID Mobile App", url: IDEA_URL, authorName: "Stewart Paterson", category: "Technology", priority: "High", timeSavedMinutes: 25 },
        { title: "Automated Reminders", url: IDEA_URL, authorName: "John Smith", category: "Operations", priority: "Medium", timeSavedMinutes: 15 },
        { title: "Customer Portal Upgrade", url: IDEA_URL, authorName: "Sarah Johnson", category: "Technology", priority: "Low", timeSavedMinutes: 10 },
      ],
      digestPeriod: "today",
      allIdeasUrl: `${APP}/ideas`,
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "IdeasNeedAttention",
    subject: "[QA] Ideas need attention",
    template: IdeasNeedAttention,
    props: {
      adminName: "Rodney",
      staleIdeas: [
        { title: "Digital Pest Activity Tracking App", url: IDEA_URL, daysInReview: 23, authorName: "Stewart Paterson", commentCount: 3, category: "Technology" },
        { title: "Automated Vehicle Stock Management", url: IDEA_URL, daysInReview: 18, authorName: "John Smith", commentCount: 1, category: "Operations" },
      ],
      threshold: 14,
      allIdeasUrl: `${APP}/admin/ideas?status=reviewing`,
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "SalesNotification",
    subject: "[QA] New sales enquiry",
    template: SalesNotification,
    props: {
      phone: "+61 412 345 678",
      message: "Hi, I'm interested in the Pro plan for our pest control business. Can you call me?",
      submittedAt: new Date().toISOString(),
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "DemoLeadCapture",
    subject: "[QA] New demo lead",
    template: DemoLeadCapture,
    props: {
      submittedAt: new Date().toISOString(),
      organizationName: ORG,
      primaryColor: COLOR,
    },
  },

  // --- Consultants ---
  {
    name: "ConsultantInviteEmail",
    subject: "[QA] An invitation to join BR360 as a consultant partner",
    template: ConsultantInviteEmail,
    props: {
      firstName: "Rodney",
      signupUrl: "https://br360.example.com/consultant-signup?invite=test-token-abc123",
      commissionPct: 30,
    },
  },
  {
    name: "ConsultantWelcomeEmail",
    subject: "[QA] Welcome to BR360 — your referral link and next steps",
    template: ConsultantWelcomeEmail,
    props: {
      firstName: "Rodney",
      email: "rodney@example.com",
      referralUrl: "https://br360.example.com/register?ref=rodney-1234",
      commissionPct: 30,
      demoResetUrl: "https://demo-corp.br360.example.com/reset-password?token=exampletoken",
      demoLoginUrl: "https://demo-corp.br360.example.com/review",
    },
  },
  {
    name: "ConsultantAccessGrantedEmail",
    subject: "[QA] You've been granted access to a client",
    template: ConsultantAccessGrantedEmail,
    props: {
      firstName: "Rodney",
      orgName: "Demo Corp",
    },
  },
  {
    name: "ConsultantAccessDeclinedEmail",
    subject: "[QA] Access request declined",
    template: ConsultantAccessDeclinedEmail,
    props: {
      firstName: "Rodney",
      orgName: "Demo Corp",
    },
  },
  {
    name: "ConsultantMonthlyStatementEmail",
    subject: "[QA] Your monthly commission statement",
    template: ConsultantMonthlyStatementEmail,
    props: {
      firstName: "Rodney",
      monthLabel: "May 2026",
      lineItems: [
        { orgName: "Demo Corp", grossCents: 4995, commissionCents: 499 },
        { orgName: "Acme Pest Control", grossCents: 9990, commissionCents: 999 },
      ],
      totalCommissionCents: 1498,
      currency: "AUD",
    },
  },

  // --- Digest ---
  {
    name: "WeeklyUserSummary",
    subject: "[QA] Your weekly summary",
    template: WeeklyUserSummary,
    props: {
      userName: "Rodney",
      userStats: { ideasSubmitted: 2, commentsMade: 5 },
      watchedIdeasUpdates: [
        { title: "Digital Pest Activity Tracking App", url: IDEA_URL, newStatus: "Approved", updatedAt: new Date().toISOString() },
      ],
      topIdeas: [
        { title: "Pest ID Mobile App", url: IDEA_URL, voteCount: 14, commentCount: 3 },
        { title: "Automated Reminders", url: IDEA_URL, voteCount: 9, commentCount: 1 },
      ],
      recentImplementations: [
        { title: "Customer Portal Upgrade", url: IDEA_URL, implementedAt: new Date().toISOString() },
      ],
      weekStartDate: "12 May 2026",
      weekEndDate: "18 May 2026",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "MonthlyAdminSummary",
    subject: "[QA] Monthly admin summary",
    template: MonthlyAdminSummary,
    props: {
      adminName: "Rodney",
      month: "May",
      year: 2026,
      stats: { submitted: 18, approved: 7, implemented: 3, rejected: 2 },
      trends: { submitted: "+12%", approved: "+40%", implemented: "+50%" },
      topContributors: [
        { name: "Stewart Paterson", count: 5 },
        { name: "Jane Smith", count: 3 },
      ],
      pendingReviewCount: 6,
      totalComments: 42,
      totalVotes: 118,
      activeUserPercent: 72,
      totalTimeSavedMinutes: 380,
      actionItems: ["Review 6 ideas pending approval", "Follow up on Pest ID app implementation"],
      organizationName: ORG,
      primaryColor: COLOR,
    },
  },
  {
    name: "QuarterlyReport",
    subject: "[QA] Quarterly business review report",
    template: QuarterlyReport,
    props: {
      recipientName: "Rodney",
      quarter: 2,
      year: 2026,
      stats: { submitted: 54, implemented: 11, totalTimeSavedMinutes: 1140, estimatedCostSavings: 8750 },
      majorImplementations: [
        { title: "Digital Pest Activity Tracking App", implementedAt: "2026-04-15", timeSavedMinutes: 25 },
        { title: "Customer Portal Upgrade", implementedAt: "2026-05-01", timeSavedMinutes: 15 },
      ],
      topContributors: [
        { name: "Stewart Paterson", count: 12 },
        { name: "Jane Smith", count: 8 },
        { name: "John Smith", count: 6 },
      ],
      participationStats: { activeUsers: 18, totalUsers: 25, percentActive: 72 },
      successStories: ["The Pest ID app has saved technicians 25 minutes per inspection."],
      nextQuarterGoals: ["Launch vehicle stock management", "Reach 80% active user rate"],
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },

  // --- Engagement ---
  {
    name: "SatisfactionSurvey",
    subject: "[QA] How are we doing?",
    template: SatisfactionSurvey,
    props: {
      userName: "Rodney",
      // #897: SPA route is /feedback, not /survey. Stale URL here was
      // the source of the "link 404s" report (token=abc123 matches the
      // placeholder exactly). engagementEmailService.js already uses
      // /feedback - the QA script just hadn't been updated.
      fullSurveyUrl: "https://br360.example.com/feedback?token=abc123",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "SurveyThankYou",
    subject: "[QA] Thanks for your feedback",
    template: SurveyThankYou,
    props: {
      rating: 4,
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "InactiveUserReengagement",
    subject: "[QA] We miss you — here's what's new",
    template: InactiveUserReengagement,
    props: {
      userName: "Rodney",
      daysSinceLastLogin: 32,
      newIdeasCount: 7,
      newImplementationsCount: 2,
      highlightedIdeas: [
        { title: "Digital Pest Activity Tracking App", url: IDEA_URL, voteCount: 14 },
      ],
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },

  // --- Notifications ---
  {
    name: "CommentOnIdea",
    subject: "[QA] New comment on your idea",
    template: CommentOnIdea,
    props: {
      userName: "Rodney",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: IDEA_URL,
      commenterName: "Jane Smith",
      commentPreview: "This would be brilliant for our quarterly termite inspections. We spend ages transcribing handwritten notes into the system...",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      unsubscribeUrl: `${APP}/unsubscribe/idea/12345`,
    },
  },
  {
    name: "CommentReply",
    subject: "[QA] Someone replied to your comment",
    template: CommentReply,
    props: {
      userName: "Rodney",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: IDEA_URL,
      replyAuthorName: "Jane Smith",
      replyPreview: "I completely agree! We could also add photo capture functionality to document evidence of pest activity...",
      originalCommentPreview: "This would save so much time on our quarterly inspections.",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
      unsubscribeUrl: null,
    },
  },
  {
    name: "IdeaImplemented",
    subject: "[QA] Your idea has been implemented",
    template: IdeaImplemented,
    props: {
      userName: "Rodney",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: IDEA_URL,
      timeSavedMinutes: 25,
      implementationDate: new Date().toISOString(),
      adminComments: "The app has been deployed to all field technicians. Training sessions will be held next week.",
      organizationName: ORG,
      organizationId: "demo-corp",
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "StatusChange",
    subject: "[QA] Your idea status has changed",
    template: StatusChange,
    props: {
      userName: "Rodney",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: IDEA_URL,
      oldStatus: "Reviewing",
      newStatus: "Approved",
      adminName: "Admin User",
      adminComments: "Great idea! We will be moving forward with this in Q2.",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "TrialWelcome",
    subject: "[QA] Your free trial has started",
    template: TrialWelcome,
    props: {
      adminName: "Rodney",
      organizationId: "demo-corp",
      organizationName: ORG,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      appUrl: "https://br360.example.com",
    },
  },
  {
    name: "TrialReminder",
    subject: "[QA] Your trial ends in 3 days",
    template: TrialReminder,
    props: {
      adminName: "Rodney",
      organizationId: "demo-corp",
      organizationName: ORG,
      daysRemaining: 3,
      trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      appUrl: "https://br360.example.com",
    },
  },
  {
    name: "TrialExpired",
    subject: "[QA] Your trial has expired",
    template: TrialExpired,
    props: {
      adminName: "Rodney",
      organizationName: ORG,
      appUrl: "https://br360.example.com",
    },
  },
  {
    name: "SubscriptionCancelled",
    subject: "[QA] Subscription cancellation confirmed",
    template: SubscriptionCancelled,
    props: {
      customerName: "Rodney",
      customerEmail: to,
      planName: "Pro Plan",
      effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      supportEmail: "hello@br360.example.com",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
  {
    name: "PaymentFailed",
    subject: "[QA] Payment failed — action required",
    template: PaymentFailed,
    props: {
      customerName: "Rodney",
      customerEmail: to,
      planName: "Pro Plan",
      retryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      portalUrl: "https://billing.stripe.com/portal/test",
      supportEmail: "hello@br360.example.com",
      organizationName: ORG,
      primaryColor: COLOR,
      logoUrl: null,
    },
  },
];

async function main() {
  console.log(`Sending ${templates.length} templates to ${to}\n`);
  let passed = 0;
  let failed = 0;

  for (const t of templates) {
    process.stdout.write(`  ${t.name.padEnd(35)}`);
    const result = await sendTemplateEmail({
      to,
      subject: t.subject,
      template: t.template,
      templateProps: t.props,
      categories: ["qa-send-all"],
    });
    if (result.success) {
      console.log(`ok  (${result.messageId})`);
      passed++;
    } else {
      console.log(`FAIL  ${result.error}`);
      failed++;
    }
    // Brief pause to stay under Resend rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone: ${passed} sent, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
