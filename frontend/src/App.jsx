import React, { useState, useContext, useEffect, useCallback } from "react";
import { useNavigate, useLocation, matchPath, Outlet } from "react-router-dom";
import useOrganizationId from "./hooks/useOrganizationId";
import { orgPath, getSubdomainURL, isOnSubdomain } from "./utils/orgPath";
import { willHopToSubdomain } from "./utils/subdomainRedirect";
import RedirectingOverlay from "./components/RedirectingOverlay";
import useBrowserBackNavigation from "./hooks/useBrowserBackNavigation";
import { useResponsive } from "./hooks/useResponsive";
import { useOrgSettings } from "./hooks/useOrgSettings";
import SuperuserSetup from "./components/SuperuserSetup";
import SuperuserTour from "./components/SuperuserTour";
import AdminTour from "./components/AdminTour";
import UserTour from "./components/UserTour";
import { ThemeContext } from "./contexts";
import { useAuth } from "./auth";
import AuthForm from "./components/AuthForm";
import LostPasswordForm from "./components/LostPasswordForm";
import Layout from "./components/Layout";
import { AppNavHeader, AppMobileMenu } from "./components/AppNav";
import TrialBanner from "./components/TrialBanner";
import TrialExpiredOverlay from "./components/TrialExpiredOverlay";
import DemoBanner from "./components/DemoBanner";
import { api } from "./api";
import { contrastingFor } from "./utils/themeUtils";
import { selectTour } from "./utils/selectTour";
import { resumeStep } from "./utils/resumeStep";
import { nextOnboardingStep } from "./utils/onboardingStep";
import { authModeTargetUrl } from "./utils/authModeRoute";
import OrgPickerModal from "./components/OrgPickerModal";
import WelcomeModal from "./components/WelcomeModal";

export default function App() {
  useBrowserBackNavigation();
  const {
    user,
    setUser,
    login,
    register,
    logout,
    loading,
    memberships,
    primaryOrganizationId,
    loginWithPickToken,
    pickOrg,
    switchToOrg,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(() =>
    location.pathname === "/register" || location.pathname.endsWith("/register")
      ? "register"
      : "login"
  );
  const organizationId = useOrganizationId();
  const defaultTheme = useContext(ThemeContext);
  const { settings, loadSettings, loadOrgSettings } = useOrgSettings();
  const { isMobile, isSmallScreen } = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [superuserRequired, setSuperuserRequired] = useState(false);
  const [superuserCheckComplete, setSuperuserCheckComplete] = useState(false);
  // Phase 3 Slice 4 (#851): ephemeral once-per-login flag for the org picker.
  // Reset on the user null->set / id-change transition (a fresh login), NOT
  // on an in-place org switch (user.id is stable there), so a multi-org user
  // sees the picker every login but not again after choosing.
  const [orgPicked, setOrgPicked] = useState(false);
  // Phase 3 Slice 5 (#851): welcome modal shown every login (ephemeral, no
  // persistence, no dismiss-forever; locked decision #7). Re-armed on the
  // user id change alongside orgPicked.
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  // Phase 5 5b (#866): pre-session multi-org pick from the org-less login.
  // The org-less /auth/login returns a pickToken + inline memberships and
  // NO session; the credentials screen renders the picker from this. After
  // the user chooses, loginWithPickToken mints the session. orgLessPicked
  // marks that the org choice was already resolved here so the post-session
  // in-app Phase 3 picker is suppressed (see the re-assert effect below).
  const [pendingPick, setPendingPick] = useState(null);
  const [orgLessPicked, setOrgLessPicked] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [adminTourOpen, setAdminTourOpen] = useState(false);
  const [userTourOpen, setUserTourOpen] = useState(false);
  // Issue #836: covers the brief window between `navigate(orgPath(...))` and
  // the subdomain-hop useEffect's `window.location.href`. Set true at the
  // handler call sites that will trigger the hop, so the overlay paints in
  // the SAME commit as the navigate (not one commit after, when the
  // intermediate route would already be mid-mount).
  const [redirecting, setRedirecting] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    const storedOrgId = organizationId || localStorage.getItem("organizationId");
    if (storedOrgId) {
      navigate(orgPath(storedOrgId, ""));
    } else {
      navigate("/");
    }
  }, [logout, navigate, organizationId]);

  // Hoisted and memoised so AuthForm / LoginForm don't re-render on every
  // App render (e.g. when org settings load and theme cascades through context).
  const handleLogin = useCallback(
    async (credential, password, recaptchaToken) => {
      // Phase 5 5b (#866): on the bare/main domain organizationId is null
      // (no subdomain, no /org/:id param) so this drives the org-less path
      // keyed by email. Deliberately NO stale-localStorage fallback here:
      // it would force the org-scoped path and defeat the credentials-first
      // entry. On a subdomain or /org/:id, organizationId is set and the
      // org-scoped request shape is byte-for-byte unchanged.
      const result = await login(credential, password, organizationId, recaptchaToken);
      if (result?.kind === "pick") {
        // Multi-org org-less: no session yet. Render the picker from the
        // inline payload (the !user branch below).
        setPendingPick(result);
        return result;
      }
      // authed. On the org-less path, land on the user's org: orgPath()
      // yields /org/<id>/review on the main domain and App's existing
      // effect redirects that to the org subdomain in production. The
      // org-scoped path keeps its own auth-redirect effect, so skip the
      // navigate there to avoid a redundant double-navigation.
      if (!organizationId && result?.user?.organizationId) {
        // Issue #836: mount the overlay BEFORE navigate so the intermediate
        // /org/<slug>/review route never paints on the main domain (where
        // the subdomain-hop useEffect will redirect the document a tick later).
        if (willHopToSubdomain()) setRedirecting(true);
        navigate(orgPath(result.user.organizationId, "review"));
      }
      return result;
    },
    [login, organizationId, navigate]
  );

  const handleRegister = useCallback(
    async (email, password, registrationOrgId, referralCode, recaptchaToken) => {
      // Phase 5 5d (#869): on the bare/main domain registrationOrgId and
      // organizationId are both empty. Deliberately NO stale-localStorage
      // fallback (same rationale as handleLogin's org-less path): pass the
      // org through as-is so the backend org-less register branch resolves
      // the shared self-serve org. On a subdomain or /org/:id the org is
      // set and the org-scoped request shape is byte-for-byte unchanged.
      // #892: username dropped as user input -- email is the sole
      // credential on both paths, and the backend auto-generates a
      // display-name username server-side.
      const currentOrgId = registrationOrgId || organizationId;
      const result = await register(email, password, currentOrgId, referralCode, recaptchaToken);
      // Org-less self-serve: land on the resolved org. orgPath() yields
      // /org/<id>/review on the main domain and App's existing effect
      // redirects that to the org subdomain in production, mirroring
      // handleLogin. Skipped on the org-scoped path (it keeps its own
      // post-auth redirect) and on the approval-pending 202 (no
      // organizationId on the returned user, so nothing to land in).
      if (!currentOrgId && result?.organizationId) {
        // Issue #836: same overlay-then-navigate pattern as handleLogin.
        if (willHopToSubdomain()) setRedirecting(true);
        navigate(orgPath(result.organizationId, "review"));
      }
      return result;
    },
    [register, organizationId, navigate]
  );

  // Issue #893: keep the URL in sync with the visible auth form. Without
  // this, switching login -> register flipped the form but the URL stayed
  // /login, breaking bookmark/share/back-button semantics. Decision lives
  // in `utils/authModeRoute.js` so it can be unit-tested without rendering
  // App (br360-gotchas skill's App.jsx OOM convention).
  const handleSwitchMode = useCallback(
    (newMode) => {
      setMode(newMode);
      const target = authModeTargetUrl(location.pathname, newMode, organizationId);
      if (target && target !== location.pathname) {
        navigate(target);
      }
    },
    [navigate, location.pathname, organizationId]
  );

  // Detect password reset token in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const onResetRoute =
      matchPath("/org/:organizationId/reset-password", window.location.pathname) ||
      matchPath("/reset-password", window.location.pathname);
    if (token && onResetRoute) {
      setIsPasswordReset(true);
      setResetToken(token);
    }
  }, []);

  // #804: auto-login via pick token when arriving from an org-switch redirect.
  // Runs only when not already logged in; clears the param after exchange.
  useEffect(() => {
    if (user || loading) return;
    const urlParams = new URLSearchParams(window.location.search);
    const pickToken = urlParams.get("pickToken");
    const currentOrgId = organizationId || localStorage.getItem("organizationId");
    if (!pickToken || !currentOrgId) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    loginWithPickToken(pickToken, currentOrgId).catch(() => {
      // Pick token expired or invalid: fall through to normal login form.
    });
  }, [user, loading, organizationId, loginWithPickToken]);

  // Redirect any /org/<slug>/... path to the corresponding subdomain URL.
  // (e.g., /org/demo-corp/review → demo-corp.br360.example.com/review)
  // Only fires on the main production domain; localhost and IPs are left as-is.
  useEffect(() => {
    if (isOnSubdomain()) return;

    const hostname = window.location.hostname;
    const baseDomain = import.meta.env.VITE_BASE_DOMAIN || "br360.example.com";
    if (hostname !== baseDomain && hostname !== `www.${baseDomain}`) return;

    const deepMatch = matchPath("/org/:organizationId/*", location.pathname);
    const rootMatch = !deepMatch && matchPath("/org/:organizationId", location.pathname);
    const match = deepMatch || rootMatch;

    if (match?.params?.organizationId) {
      const slug = match.params.organizationId;
      const page = deepMatch?.params?.["*"] || "";
      const query = window.location.search;
      // Issue #836: cover the brief tear-down window for the bookmark /
      // deep-link safety-net path (login/register handlers already arm the
      // overlay before navigate; this catches paths that bypassed them).
      setRedirecting(true);
      window.location.href = getSubdomainURL(slug, page + query);
    }
  }, [location.pathname]);

  // Load settings when user changes
  useEffect(() => {
    if (user) {
      if (user.organizationId) loadOrgSettings(user.organizationId);
      else loadSettings();
    } else {
      setMode("login");
      setTourOpen(false);
      setAdminTourOpen(false);
      setUserTourOpen(false);
    }
  }, [user]);

  // Phase 3 Slices 4 + 5: re-arm the onboarding sequence on a fresh login.
  // user?.id changes on login (undefined->id) and logout (id->undefined) but
  // is stable across an in-place org switch, so the picker does not reopen
  // after a choice and the welcome modal shows once per login.
  useEffect(() => {
    setOrgPicked(false);
    setWelcomeSeen(false);
  }, [user?.id]);

  // Phase 5 5b (#866): a multi-org user who chose their org on the
  // pre-session credentials-screen picker has ALREADY resolved the org
  // choice. loginWithPickToken mints a fresh session (user.id undefined
  // -> id), which fires the re-arm effect above and clears orgPicked,
  // which would otherwise immediately re-open the in-app Phase 3 picker
  // (a double prompt). Re-assert orgPicked here. Declared AFTER the
  // re-arm effect so it runs later in the same commit (effects run in
  // declaration order) -- the established App.jsx ordering pattern (cf.
  // the tour-open navigation effects below). Deterministic, not racy;
  // orgPicked stays ephemeral (no persistence, design unchanged). welcome
  // + tour still run (welcomeSeen is re-armed), matching the agreed flow.
  useEffect(() => {
    if (orgLessPicked) setOrgPicked(true);
  }, [orgLessPicked, user?.id]);

  // Clear the org-less pick state on logout (user -> null) so the next
  // login re-arms cleanly.
  useEffect(() => {
    if (!user) {
      setPendingPick(null);
      setOrgLessPicked(false);
    }
  }, [user]);

  // Phase 3 Slice 2: tour completion is gated by the per-user server flags
  // hasSeen{Superuser,Admin,User}Walkthrough (the tour components already
  // PATCH /users/walkthrough on complete). We optimistically mirror the flag
  // onto the auth-context user so the trigger effect below does not re-open
  // the tour within the same session before the next /auth/me refresh.
  //
  // Stable callbacks so the tour components' useEffect([onComplete]) dep never
  // changes due to App re-renders (e.g., when org settings load mid-session).
  const handleSuperuserTourComplete = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, hasSeenSuperuserWalkthrough: true } : prev));
    setTourOpen(false);
  }, [setUser]);

  const handleAdminTourComplete = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, hasSeenAdminWalkthrough: true } : prev));
    setAdminTourOpen(false);
  }, [setUser]);

  const handleUserTourComplete = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, hasSeenUserWalkthrough: true } : prev));
    setUserTourOpen(false);
  }, [setUser]);

  // Trigger onboarding tour -- Issue #766, Phase 3 Slice 2.
  // Gate is now the per-user server flags hasSeen{Superuser,Admin,User}
  // Walkthrough (delivered on login/register and /auth/me). A missing flag
  // (brand-new user, or demo token which has no row) reads as falsy and
  // shows the tour, which is the intended behaviour. Role precedence is
  // unchanged: superuser, then admin (non-superuser), then plain user.
  // NOTE: navigate to /admin is NOT called here. The auth-redirect effect (dep
  // [user, location]) runs in the same batch and its navigate('/review', {replace})
  // overwrites any navigate called here. Instead, dedicated effects on [tourOpen]
  // and [adminTourOpen] fire in the next render cycle (after auth redirect settles)
  // and win without interference.
  useEffect(() => {
    // Slice 5: one ordered onboarding sequence. The tour only opens once the
    // org picker (multi-org) and the welcome modal have both been resolved,
    // so neither starts behind the other.
    const step = nextOnboardingStep({ user, memberships, orgPicked, welcomeSeen });
    if (step !== "tour") return;
    const tour = selectTour(user);
    if (tour === "superuser") setTourOpen(true);
    else if (tour === "admin") setAdminTourOpen(true);
    else if (tour === "user") setUserTourOpen(true);
  }, [user, memberships, orgPicked, welcomeSeen]);

  // Navigate to admin settings when superuser/admin tour opens so that step 2+
  // elements (org name input etc.) exist in the DOM. Runs after the auth-redirect
  // effect has settled (separate dep means separate render cycle).
  useEffect(() => {
    if (tourOpen && user) navigate(orgPath(user.organizationId || organizationId, "admin"));
  }, [tourOpen, navigate, user, organizationId]);

  useEffect(() => {
    if (adminTourOpen && user) navigate(orgPath(user.organizationId || organizationId, "admin"));
  }, [adminTourOpen, navigate, user, organizationId]);

  // Handle authentication-based redirects and org settings
  useEffect(() => {
    if (loading) return;

    if (!user && organizationId) {
      loadOrgSettings(organizationId, true);
    } else if (!user && !organizationId) {
      const storedOrgId = localStorage.getItem("organizationId");
      if (storedOrgId) loadOrgSettings(storedOrgId, true);
    }

    if (user) {
      console.log(
        "[Security Check] user:",
        user.username,
        "user.organizationId:",
        user.organizationId,
        "URL organizationId:",
        organizationId
      );

      if (organizationId && user.organizationId && user.organizationId !== organizationId) {
        console.warn(
          `[Security] User ${user.username} from org "${user.organizationId}" attempted to access org "${organizationId}"`
        );

        const isLandingOrLogin =
          location.pathname === `/org/${organizationId}` ||
          location.pathname === `/org/${organizationId}/` ||
          location.pathname === `/org/${organizationId}/login` ||
          location.pathname === `/org/${organizationId}/register` ||
          location.pathname === `/org/${organizationId}/reset-password` ||
          location.pathname === "/" ||
          location.pathname === "/login" ||
          location.pathname === "/register" ||
          location.pathname === "/reset-password";

        if (isLandingOrLogin) {
          logout();
          return;
        }

        // Extract the page segment regardless of whether we're on a subdomain
        // (bare path like /review) or the legacy prefixed form (/org/slug/review).
        const currentPage = isOnSubdomain()
          ? location.pathname.slice(1)
          : location.pathname.split("/").slice(3).join("/");

        // Always hard-navigate to the correct subdomain (works on main domain too).
        window.location.href = getSubdomainURL(user.organizationId, currentPage || "review");
        return;
      }

      const isAdminRoute =
        matchPath("/org/:organizationId/admin", location.pathname) ||
        matchPath("/org/:organizationId/admin/*", location.pathname) ||
        matchPath("/org/:organizationId/analytics", location.pathname) ||
        matchPath("/org/:organizationId/analytics/*", location.pathname) ||
        matchPath("/admin", location.pathname) ||
        matchPath("/admin/*", location.pathname) ||
        matchPath("/analytics", location.pathname) ||
        matchPath("/analytics/*", location.pathname);
      if (isAdminRoute && !user.isAdmin && organizationId) {
        navigate(orgPath(organizationId, "review"), { replace: true });
      }

      const isLoginPage =
        matchPath("/org/:organizationId/login", location.pathname) ||
        matchPath("/login", location.pathname);
      if (isLoginPage && organizationId) {
        navigate(orgPath(organizationId, "review"), { replace: true });
      }
    } else {
      const protectedPatterns = [
        "/org/:organizationId/review",
        "/org/:organizationId/submit",
        "/org/:organizationId/admin",
        "/org/:organizationId/admin/*",
        "/org/:organizationId/analytics",
        "/org/:organizationId/analytics/*",
        "/org/:organizationId/notifications",
        "/org/:organizationId/home",
        "/org/:organizationId/idea/:slug",
        // Bare paths for subdomain tenancy (#517)
        "/review",
        "/submit",
        "/admin",
        "/admin/*",
        "/analytics",
        "/analytics/*",
        "/notifications",
        "/home",
        "/idea/:slug",
      ];
      const isProtectedRoute = protectedPatterns.some((pattern) =>
        matchPath(pattern, location.pathname)
      );
      const isLoginPage =
        matchPath("/org/:organizationId/login", location.pathname) ||
        matchPath("/login", location.pathname);
      const isResetPasswordPage =
        matchPath("/org/:organizationId/reset-password", location.pathname) ||
        matchPath("/reset-password", location.pathname);

      if (isProtectedRoute && !isLoginPage && !isResetPasswordPage && organizationId) {
        navigate(orgPath(organizationId, "login"), { replace: true });
      }
    }
  }, [user, organizationId, location.pathname, loading]);

  // Check if superuser setup is required on mount
  useEffect(() => {
    api
      .get("/setup/superuser-required", { skipOrganizationId: true })
      .then((res) => {
        setSuperuserRequired(res.data.superuserRequired);
        setSuperuserCheckComplete(true);
      })
      .catch(() => {
        setSuperuserRequired(false);
        setSuperuserCheckComplete(true);
      });
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  const theme = { ...defaultTheme, ...settings };
  theme.formTextColor = defaultTheme.formTextColor || theme.textColor;
  theme.headerTextColor =
    defaultTheme.headerTextColor || contrastingFor(theme.primaryColor, theme.formTextColor);
  theme.buttonTextColor =
    defaultTheme.buttonTextColor || contrastingFor(theme.primaryColor, theme.formTextColor);

  if (loading || !superuserCheckComplete) {
    return (
      <>
        <RedirectingOverlay visible={redirecting} />
        <div
          style={{
            background: theme.backgroundColor,
            minHeight: "100vh",
            color: theme.textColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div>Loading...</div>
        </div>
      </>
    );
  }

  if (superuserRequired) {
    return (
      <>
        <RedirectingOverlay visible={redirecting} />
        <Layout
          headerProps={{ isMobile }}
          contentStyle={{
            background: theme.backgroundColor,
            color: theme.backgroundColor
              ? contrastingFor(theme.backgroundColor, theme.textColor)
              : undefined,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              paddingTop: isSmallScreen ? "16px" : "clamp(80px, 20vh, 200px)",
              paddingBottom: isSmallScreen ? "16px" : "0",
            }}
          >
            <SuperuserSetup onSuccess={() => setSuperuserRequired(false)} />
          </div>
        </Layout>
      </>
    );
  }

  if (!user) {
    if (isPasswordReset && resetToken) {
      return (
        <>
          <RedirectingOverlay visible={redirecting} />
          <Layout
            headerProps={{ isMobile }}
            contentStyle={{
              background: theme.backgroundColor,
              color: theme.backgroundColor
                ? contrastingFor(theme.backgroundColor, theme.textColor)
                : undefined,
            }}
          >
            <div
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <LostPasswordForm
                onSuccess={() => {
                  setIsPasswordReset(false);
                  setResetToken("");
                  window.history.replaceState({}, document.title, "/");
                }}
              />
            </div>
          </Layout>
        </>
      );
    }

    // Phase 5 5b (#866): multi-org org-less login resolved to a pickToken
    // and an inline membership list with NO session. Render the existing
    // Phase 3 OrgPickerModal from that inline payload (the post-session
    // /auth/memberships source is unreachable pre-session). On choose,
    // exchange the pickToken for a session and land on the chosen org;
    // orgLessPicked then suppresses the post-session in-app picker.
    if (pendingPick) {
      return (
        <>
          <RedirectingOverlay visible={redirecting} />
          <Layout
            headerProps={{ isMobile, orgSettings: settings }}
            contentStyle={{
              background: theme.backgroundColor,
              color: theme.backgroundColor
                ? contrastingFor(theme.backgroundColor, theme.textColor)
                : undefined,
            }}
          >
            <div
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <OrgPickerModal
                memberships={pendingPick.memberships}
                primaryOrganizationId={pendingPick.primaryOrganizationId}
                currentOrganizationId={null}
                onChoose={async (orgId) => {
                  await loginWithPickToken(pendingPick.pickToken, orgId);
                  setOrgLessPicked(true);
                  setPendingPick(null);
                  if (willHopToSubdomain()) setRedirecting(true);
                  navigate(orgPath(orgId, "review"));
                }}
              />
            </div>
          </Layout>
        </>
      );
    }

    return (
      <>
        <RedirectingOverlay visible={redirecting} />
        <Layout
          headerProps={{ isMobile, orgSettings: settings }}
          contentStyle={{
            background: theme.backgroundColor,
            color: theme.backgroundColor
              ? contrastingFor(theme.backgroundColor, theme.textColor)
              : undefined,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              paddingTop: isSmallScreen ? "16px" : "clamp(80px, 20vh, 200px)",
              paddingBottom: isSmallScreen ? "16px" : "0",
            }}
          >
            <AuthForm
              mode={mode}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onSwitchMode={handleSwitchMode}
            />
          </div>
        </Layout>
      </>
    );
  }

  const outletContext = {
    user,
    organizationId,
    onSettingsUpdate: () => {
      if (user.organizationId) loadOrgSettings(user.organizationId);
      else loadSettings();
    },
    onNavigateRelative: (page) => {
      navigate(orgPath(organizationId, page === "review" ? "review" : page));
    },
  };

  return (
    <>
      <RedirectingOverlay visible={redirecting} />
      <Layout
        headerProps={{ isMobile, user, admin: user?.isAdmin }}
        headerChildren={
          <AppNavHeader
            user={user}
            organizationId={organizationId}
            isMobile={isMobile}
            onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
            onLogout={handleLogout}
            orgName={settings.organizationName}
            primaryColor={settings.primaryColor}
            memberships={memberships}
            onSwitchOrg={switchToOrg}
            onResumeTour={
              user?.isSuperuser
                ? () => setTourOpen(true)
                : user?.isAdmin
                  ? () => setAdminTourOpen(true)
                  : null
            }
          />
        }
        mobileMenu={
          <AppMobileMenu
            isOpen={mobileMenuOpen}
            isMobile={isMobile}
            onClose={() => setMobileMenuOpen(false)}
            user={user}
            organizationId={organizationId}
            onLogout={handleLogout}
            orgName={settings.organizationName}
            primaryColor={settings.primaryColor}
          />
        }
        containerStyle={{
          background: theme.backgroundColor,
          color: theme.backgroundColor
            ? contrastingFor(theme.backgroundColor, theme.textColor)
            : undefined,
        }}
      >
        {user?.isDemo && <DemoBanner user={user} onUserUpdate={setUser} />}
        {user?.trialEndsAt && !user?.isDemo && (
          <TrialBanner trialEndsAt={user.trialEndsAt} trialExpired={user.trialExpired ?? false} />
        )}
        <Outlet context={outletContext} />
        {nextOnboardingStep({ user, memberships, orgPicked, welcomeSeen }) === "orgPicker" && (
          <OrgPickerModal
            memberships={memberships}
            primaryOrganizationId={primaryOrganizationId}
            currentOrganizationId={user?.organizationId}
            onChoose={async (orgId) => {
              await pickOrg(orgId);
              setOrgPicked(true);
            }}
          />
        )}
        {nextOnboardingStep({ user, memberships, orgPicked, welcomeSeen }) === "welcome" && (
          <WelcomeModal
            orgName={settings.organizationName}
            onContinue={() => setWelcomeSeen(true)}
          />
        )}
        <TrialExpiredOverlay open={user?.trialExpired === true} />
        {tourOpen && (
          <SuperuserTour
            onComplete={handleSuperuserTourComplete}
            startStep={resumeStep(user, "superuser")}
          />
        )}
        {adminTourOpen && (
          <AdminTour onComplete={handleAdminTourComplete} startStep={resumeStep(user, "admin")} />
        )}
        {userTourOpen && (
          <UserTour
            onComplete={handleUserTourComplete}
            bigQuestion={settings.bigQuestion}
            orgName={settings.organizationName}
            startStep={resumeStep(user, "user")}
          />
        )}
      </Layout>
    </>
  );
}
