import React, { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useOutletContext,
  useLocation,
} from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { getSubdomainOrgId, isAdminSubdomain } from "./utils/orgPath";
const AdminApp = lazy(() => import("./AdminApp"));
import ReviewIdeas from "./components/ReviewIdeas";
import ErrorPage from "./components/ErrorPage";

const SubmitIdea = lazy(() => import("./components/SubmitIdea"));
const AdminSettings = lazy(() => import("./components/AdminSettings"));
const Analytics = lazy(() => import("./components/Analytics"));
const BoardReport = lazy(() => import("./components/analytics/BoardReport"));
const SurveysTab = lazy(() => import("./components/analytics/SurveysTab"));
const IdeaPage = lazy(() => import("./components/IdeaPage"));
const OrganizationLanding = lazy(() => import("./components/OrganizationLanding"));
const OrganizationPrompt = lazy(() => import("./components/OrganizationPrompt"));
const BillingSuccess = lazy(() => import("./components/BillingSuccess.jsx"));
const BillingCancel = lazy(() => import("./components/BillingCancel.jsx"));
const CheckoutForm = lazy(() => import("./components/CheckoutForm"));
const SuperuserSetupPage = lazy(() => import("./components/SuperuserSetupPage"));
const PricingPage = lazy(() => import("./components/PricingPage"));
const TrialSignupPage = lazy(() => import("./components/TrialSignupPage"));
const DemoAccessPage = lazy(() => import("./components/DemoAccessPage"));
const DemoSignupPage = lazy(() => import("./components/DemoSignupPage"));
const MagicLinkRedeemPage = lazy(() => import("./components/MagicLinkRedeemPage"));
const NotificationSettings = lazy(() => import("./components/NotificationSettings"));
const UnsubscribePage = lazy(() => import("./components/UnsubscribePage"));
const FeedbackSurveyPage = lazy(() => import("./components/FeedbackSurveyPage"));
const FeedbackThanksPage = lazy(() => import("./components/FeedbackThanksPage"));
const EmailAnalyticsDashboard = lazy(() => import("./components/EmailAnalyticsDashboard"));
const OAuthCallback = lazy(() => import("./components/OAuthCallback"));
const ConsultantSignupPage = lazy(() => import("./components/ConsultantSignupPage"));

// Hook for child route components to read App's outlet context.
export function useAppOutletContext() {
  return useOutletContext();
}

function AdminSettingsRoute() {
  const { user, onSettingsUpdate } = useAppOutletContext();
  if (!user?.isAdmin && !user?.isSuperuser) return null;
  return <AdminSettings user={user} onSettingsUpdate={onSettingsUpdate} />;
}

function AnalyticsRoute() {
  const { user } = useAppOutletContext();
  if (!user?.isAdmin) return null;
  return <Analytics />;
}

function EmailAnalyticsRoute() {
  const { user } = useAppOutletContext();
  if (!user?.isAdmin) return null;
  return <EmailAnalyticsDashboard />;
}

function SubmitIdeaRoute() {
  const { onNavigateRelative } = useAppOutletContext();
  return <SubmitIdea onNavigate={onNavigateRelative} />;
}

// Login and reset-password mount the App layout but render nothing into the
// Outlet (App handles the unauthenticated AuthForm / LostPasswordForm flow).
function AuthOutletPlaceholder() {
  return null;
}

// Renders App on a tenant subdomain; redirects to /org on the main domain.
// Used as the layout element for bare-path routes (no /org/:id prefix).
function SubdomainAppWrapper() {
  if (!getSubdomainOrgId()) return <Navigate to="/org" replace />;
  return <App />;
}

// Renders children on a tenant subdomain; redirects to /org on the main domain.
// Used for routes that don't use the App layout (OrganizationLanding, IdeaPage).
function SubdomainOnly({ children }) {
  if (!getSubdomainOrgId()) return <Navigate to="/org" replace />;
  return children;
}

// Resets the error boundary's error state whenever the pathname changes so
// that pressing Back from an error page re-renders the previous route.
// Uses resetKey (not key) so children are NOT remounted on navigation.
function LocationAwareErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

// Route table extracted so it can be mounted under any router
// (BrowserRouter in production, MemoryRouter in tests).
export function AppRoutes() {
  if (isAdminSubdomain()) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }

  return (
    <LocationAwareErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/org" element={<OrganizationPrompt />} />
          <Route path="/org/:organizationId" element={<OrganizationLanding />} />

          {/* Organisation-specific app routes. Nested under App (layout shell). */}
          <Route element={<App />}>
            <Route path="/org/:organizationId/login" element={<AuthOutletPlaceholder />} />
            <Route path="/org/:organizationId/reset-password" element={<AuthOutletPlaceholder />} />
            <Route path="/org/:organizationId/home" element={<ReviewIdeas />} />
            <Route path="/org/:organizationId/review" element={<ReviewIdeas />} />
            <Route path="/org/:organizationId/submit" element={<SubmitIdeaRoute />} />
            <Route path="/org/:organizationId/notifications" element={<NotificationSettings />} />
            {/* More specific /admin/email-analytics declared before generic /admin. */}
            <Route
              path="/org/:organizationId/admin/email-analytics"
              element={<EmailAnalyticsRoute />}
            />
            <Route path="/org/:organizationId/admin" element={<AdminSettingsRoute />} />
            <Route path="/org/:organizationId/analytics" element={<AnalyticsRoute />} />
            <Route
              path="/org/:organizationId/analytics/priority-matrix"
              element={<AnalyticsRoute />}
            />
            <Route path="/org/:organizationId/analytics/word-cloud" element={<AnalyticsRoute />} />
            <Route
              path="/org/:organizationId/analytics/board-report"
              element={
                <Suspense fallback={null}>
                  <BoardReport />
                </Suspense>
              }
            />
            <Route
              path="/org/:organizationId/analytics/surveys"
              element={
                <Suspense fallback={null}>
                  <SurveysTab />
                </Suspense>
              }
            />
          </Route>

          {/* Idea route uses its own layout (IdeaPage) rather than App. */}
          <Route path="/org/:organizationId/idea/:slug" element={<IdeaPage />} />

          {/* Billing routes */}
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/signup" element={<CheckoutForm />} />
          <Route path="/free-trial" element={<TrialSignupPage />} />
          {/* #872: the canonical self-serve demo lives at /try. /demo is a
              Hugo marketing page ("Book a Demo" lead form) and shadows the
              SPA fallback in the prod build, so DemoAccessPage was
              unreachable there. /try has no Hugo collision. */}
          <Route path="/try" element={<DemoAccessPage />} />
          {/* #892 PR3: real-account demo signup. /try stays for the
              ephemeral "no account, just look" case. */}
          <Route path="/demo-signup" element={<DemoSignupPage />} />
          {/* #892 PR4: lands the emailed magic-link ?token=... . Public --
              outside App/SubdomainAppWrapper, same reasoning as
              OAuthCallback below: App returns <AuthForm> early when
              !user, which would prevent this page from ever mounting. */}
          <Route path="/auth/magic-link" element={<MagicLinkRedeemPage />} />
          <Route path="/payment/success" element={<BillingSuccess />} />
          <Route path="/payment/cancel" element={<BillingCancel />} />
          <Route path="/org/:organizationId/billing/success" element={<BillingSuccess />} />
          <Route path="/org/:organizationId/billing/cancel" element={<BillingCancel />} />
          <Route path="/org/:organizationId/setup/superuser" element={<SuperuserSetupPage />} />

          {/* Consultant signup (public, invite-only) */}
          <Route path="/consultant-signup" element={<ConsultantSignupPage />} />

          {/* Unsubscribe (public, no auth required for CAN-SPAM compliance) */}
          <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />

          {/* Survey feedback (public, token-gated; linked from satisfaction survey emails) */}
          <Route path="/feedback" element={<FeedbackSurveyPage />} />
          <Route path="/feedback/thanks" element={<FeedbackThanksPage />} />
          <Route path="/org/:organizationId/feedback" element={<FeedbackSurveyPage />} />
          <Route path="/org/:organizationId/feedback/thanks" element={<FeedbackThanksPage />} />

          {/* OAuth callbacks: must be outside SubdomainAppWrapper/App so they render
              before auth. App returns <AuthForm> early when !user, which would
              prevent OAuthCallback from ever mounting and processing the token. */}
          <Route path="/org/:organizationId/oauth-callback" element={<OAuthCallback />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />

          {/* ─── Bare routes for subdomain tenancy (#517) ─── */}
          {/* SubdomainAppWrapper renders App on a tenant subdomain and redirects  */}
          {/* to /org on the main domain (same behaviour as the old redirect shims). */}
          <Route
            path="/"
            element={
              <SubdomainOnly>
                <OrganizationLanding />
              </SubdomainOnly>
            }
          />
          <Route
            path="/idea/:slug"
            element={
              <SubdomainOnly>
                <IdeaPage />
              </SubdomainOnly>
            }
          />
          {/* Phase 5 5b (#866 / Correction Decision A): bare-domain auth
              entry renders App directly rather than via SubdomainAppWrapper.
              SubdomainAppWrapper force-redirects the main domain to /org
              (the old "type your org id" gate). For the AUTH routes only we
              drop that gate: on the main domain App shows the org-less
              credentials screen; on a tenant subdomain App resolves the org
              from the hostname exactly as before (same as the org-scoped
              <Route element={<App />}> block above). OrganizationPrompt stays
              reachable at /org but is no longer forced. Deep app routes below
              still require an org and keep SubdomainAppWrapper. */}
          <Route element={<App />}>
            <Route path="/login" element={<AuthOutletPlaceholder />} />
            <Route path="/register" element={<AuthOutletPlaceholder />} />
            <Route path="/reset-password" element={<AuthOutletPlaceholder />} />
          </Route>
          <Route element={<SubdomainAppWrapper />}>
            <Route path="/home" element={<ReviewIdeas />} />
            <Route path="/review" element={<ReviewIdeas />} />
            <Route path="/submit" element={<SubmitIdeaRoute />} />
            <Route path="/notifications" element={<NotificationSettings />} />
            <Route path="/admin/email-analytics" element={<EmailAnalyticsRoute />} />
            <Route path="/admin" element={<AdminSettingsRoute />} />
            <Route path="/analytics/priority-matrix" element={<AnalyticsRoute />} />
            <Route path="/analytics/word-cloud" element={<AnalyticsRoute />} />
            <Route
              path="/analytics/board-report"
              element={
                <Suspense fallback={null}>
                  <BoardReport />
                </Suspense>
              }
            />
            <Route
              path="/analytics/surveys"
              element={
                <Suspense fallback={null}>
                  <SurveysTab />
                </Suspense>
              }
            />
            <Route path="/analytics" element={<AnalyticsRoute />} />
          </Route>

          <Route
            path="*"
            element={
              <ErrorPage
                code={404}
                title="Page not found"
                message="The page you're looking for doesn't exist or has been moved."
              />
            }
          />
        </Routes>
      </Suspense>
    </LocationAwareErrorBoundary>
  );
}

export default function AppWrapper() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
