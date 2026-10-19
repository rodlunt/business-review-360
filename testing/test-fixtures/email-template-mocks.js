// Centralised Jest mock factory for React Email templates.
//
// All *.jsx paths in the backend resolve to the same module id via the
// moduleNameMapper in backend/package.json (`*.jsx` -> react/jsx-runtime).
// That means jest.unstable_mockModule only needs ONE call per test file,
// but the factory MUST export every name that any *.jsx import in the
// module under test might pull in -- otherwise the second call for a
// different template path overwrites the first and leaves exports missing.
//
// Usage in a test file:
//   import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';
//   jest.unstable_mockModule('../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx', allEmailTemplatesMock);
//
// When a new template is added, add its export name here. No other test
// file needs to change. Issue #703.

export function allEmailTemplatesMock() {
  const stub = () => null;
  return {
    default: stub,
    // admin/
    DailyIdeaDigest: stub,
    DemoLeadCapture: stub,
    IdeasNeedAttention: stub,
    NewIdeaSubmitted: stub,
    SalesNotification: stub,
    // auth/
    AdminUserPendingApproval: stub,
    MagicLink: stub,
    PasswordChanged: stub,
    PasswordReset: stub,
    UserAccountApproved: stub,
    VerifyEmail: stub,
    Welcome: stub,
    // digest/
    MonthlyAdminSummary: stub,
    QuarterlyReport: stub,
    WeeklyUserSummary: stub,
    // engagement/
    InactiveUserReengagement: stub,
    SatisfactionSurvey: stub,
    SurveyThankYou: stub,
    // notifications/
    CommentOnIdea: stub,
    CommentReply: stub,
    IdeaImplemented: stub,
    PaymentFailed: stub,
    SignupWelcome: stub,
    StatusChange: stub,
    SubscriptionCancelled: stub,
    TrialExpired: stub,
    TrialReminder: stub,
    TrialWelcome: stub,
    // consultants/ (#808 Phase 2 + Phase 3)
    ConsultantInviteEmail: stub,
    ConsultantWelcomeEmail: stub,
    ConsultantAccessGrantedEmail: stub,
    ConsultantAccessDeclinedEmail: stub,
    ConsultantMonthlyStatementEmail: stub,
  };
}
