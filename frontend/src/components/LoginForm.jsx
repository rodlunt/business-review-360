import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  TextField,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  IconButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { GitHub, Visibility, VisibilityOff } from "@mui/icons-material";
import { useLocation, useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { api, API_BASE_URL } from "../api";
import { getSubdomainOrgId } from "../utils/orgPath";
import { GoogleIcon, MicrosoftIcon } from "./oauthIcons";
import formStyles from "./formStyles";

// Phase 5 5b (#866): `orgLess` is set on the bare/main-domain credentials
// screen (no subdomain, no /org/:id param). In that mode the single
// credential field is the email (the backend org-optional branch keys off
// email, 5a #858), no per-tenant settings are fetched (there is no tenant
// yet, so reCAPTCHA stays on by the safe default and per-org OAuth buttons
// are not offered), and NULL-email copy explains the OAuth/SSO fallback.
function LoginForm({ onLogin, onSwitchMode, orgLess = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { executeRecaptcha } = useGoogleReCaptcha();
  // #892: email is the sole credential on both the org-less and org-scoped
  // paths now (username dropped as a login credential; it survives only
  // as a display name on the User row).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    location.state?.oauthError || searchParams.get("oauthError") || ""
  );
  const [oauthLoading, setOauthLoading] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [settings, setSettings] = useState({ useCaptcha: true });

  // Fetch per-tenant settings so we know whether to execute reCAPTCHA on
  // submit. Uses the public endpoint so unauthenticated users on the login
  // page can read useCaptcha without a token (#559).
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Org-less screen has no tenant: do not fetch a (possibly stale
        // localStorage) org's branding/OAuth. Defaults keep reCAPTCHA on.
        if (orgLess) return;
        const orgId =
          getSubdomainOrgId() || params?.organizationId || localStorage.getItem("organizationId");
        if (!orgId) return;
        const res = await api.get(`/settings/organization/${orgId}/public`, {
          skipOrganizationId: true,
        });
        setSettings(res.data);
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, [params?.organizationId, orgLess]);

  const captchaEnabled = settings.useCaptcha !== "false" && settings.useCaptcha !== false;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Issue #559: attach reCAPTCHA token when the per-tenant useCaptcha flag
    // is on. Backend verifies and returns 401 on captcha failure (oracle-safe).
    let recaptchaToken = null;
    if (captchaEnabled && executeRecaptcha) {
      try {
        recaptchaToken = await executeRecaptcha("login");
      } catch (err) {
        console.error("reCAPTCHA error:", err);
        setError("CAPTCHA verification failed. Please try again.");
        setLoading(false);
        return;
      }
    }

    onLogin(email, password, recaptchaToken)
      .catch((err) => {
        setError(err?.response?.data?.error || err?.message || "Login failed. Please try again.");
      })
      .finally(() => setLoading(false));
  }

  // Auto-dismiss success alert after 5 seconds
  useEffect(() => {
    if (recoverySent) {
      const timer = setTimeout(() => {
        handleCloseDialog();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [recoverySent]);

  // Auto-dismiss error alert after 5 seconds
  useEffect(() => {
    if (recoveryError) {
      const timer = setTimeout(() => {
        setRecoveryError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [recoveryError]);

  function handleLostPassword() {
    // Reset state when opening dialog to allow re-triggering
    setRecoverySent(false);
    setRecoveryError("");
    setRecoveryEmail("");
    setLostOpen(true);
  }

  function handleCloseDialog() {
    setLostOpen(false);
    // Reset state after closing so user can trigger again
    setTimeout(() => {
      setRecoverySent(false);
      setRecoveryError("");
      setRecoveryEmail("");
    }, 300); // Delay to allow dialog close animation
  }

  async function handleSendRecovery() {
    setRecoveryError("");
    setSendingRecovery(true);

    // Issue #559: attach reCAPTCHA token when tenant captcha is on. Backend
    // returns the generic enumeration-safe response on captcha failure, so
    // the UI receives success regardless of verify outcome.
    let recaptchaToken = null;
    if (captchaEnabled && executeRecaptcha) {
      try {
        recaptchaToken = await executeRecaptcha("password_reset");
      } catch (err) {
        console.error("reCAPTCHA error:", err);
        setRecoveryError("CAPTCHA verification failed. Please try again.");
        setSendingRecovery(false);
        return;
      }
    }

    try {
      await api.post("/auth/request-password-reset", {
        email: recoveryEmail,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      });
      setRecoverySent(true);
    } catch (err) {
      setRecoveryError(err?.response?.data?.error || "Failed to send recovery email.");
    } finally {
      setSendingRecovery(false);
    }
  }

  function handleOAuthLogin(provider) {
    setOauthLoading(true);
    // #892 PR4: org-less main-domain OAuth has no tenant context. The
    // backend initiate accepts a missing ?org= and runs the no-org branch,
    // which looks the OAuth identity up by email post-callback and routes
    // to either a welcome banner or the user's existing org subdomain.
    if (orgLess) {
      window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}`;
      return;
    }
    const orgId =
      getSubdomainOrgId() || params?.organizationId || localStorage.getItem("organizationId");
    if (!orgId) {
      setOauthLoading(false);
      setError("No organisation selected. Please refresh the page.");
      return;
    }
    window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}?org=${encodeURIComponent(orgId)}`;
  }

  // #892 PR4: on the org-less main-domain login, surface the platform-level
  // providers (Google / GitHub / Microsoft) unconditionally. Azure SSO is
  // per-tenant config and only renders on the org-scoped path. The org-less
  // initiate uses getBaseProviderConfig (env-keyed clientIds), so per-org
  // settings have nothing to say here.
  const showOrgLessOAuth = (provider) => orgLess && provider !== "azure-ad";

  const hasOAuth =
    orgLess ||
    settings.oauthGoogleEnabled ||
    settings.oauthGithubEnabled ||
    settings.oauthMicrosoftEnabled ||
    settings.ssoAzureEnabled;

  // #892 PR4: welcome banner driven by the OAuth no-org callback's redirect
  // query params. Three values today: oauth-no-org (greet by name, point at
  // demo or admin invite), oauth-multi-org (existing user with multiple
  // orgs - stop-gap until the OAuth picker lands).
  const oauthMsg = searchParams.get("msg");
  const oauthName = searchParams.get("name");

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        m: 0,
        p: 0,
      }}
    >
      <Box sx={{ ...formStyles.root, width: "100%", m: 0, p: 0 }}>
        <Box sx={formStyles.cardBox}>
          <Card sx={formStyles.card}>
            <CardContent>
              {/* #892 PR4: welcome banner driven by the no-org OAuth
                  callback's redirect query params. oauth-no-org = new or
                  membership-less user (greet by name and point at the demo
                  CTAs below). oauth-multi-org = stop-gap for users with 2+
                  approved memberships until the OAuth picker lands. */}
              {orgLess && oauthMsg === "oauth-no-org" && (
                <Alert severity="info" sx={{ mb: 2 }} data-testid="oauth-no-org-banner">
                  {oauthName ? `Hi ${oauthName}! ` : ""}
                  No organisation is linked to your account yet. Try the demo below, or ask your
                  administrator for an invite.
                </Alert>
              )}
              {orgLess && oauthMsg === "oauth-multi-org" && (
                <Alert severity="info" sx={{ mb: 2 }} data-testid="oauth-multi-org-banner">
                  Your account belongs to multiple organisations. Please sign in via your
                  organisation's subdomain to use single sign-on.
                </Alert>
              )}
              <Typography {...formStyles.title}>Login</Typography>
              <Box
                component="form"
                onSubmit={handleSubmit}
                autoComplete="off"
                sx={{
                  ...formStyles.form,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {/* Credential group. #892: email is the sole credential on
                    both the org-less (bare/main domain) and org-scoped
                    (subdomain or /org/:id) paths -- the two modes converge
                    on the same field. */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <TextField
                    label="Email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Email"
                    size={formStyles.input.size}
                    margin="none"
                    sx={{ background: "#fff", margin: 0 }}
                    slotProps={{
                      input: {
                        "data-testid": "email",
                        autoComplete: "username",
                      },
                    }}
                  />
                  {orgLess && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                      data-testid="orgless-email-hint"
                    >
                      Use the email linked to your account, or sign in below with Google, Microsoft,
                      or GitHub.
                    </Typography>
                  )}
                </Box>
                {/* Password group */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    mb: 0,
                  }}
                >
                  <TextField
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Password"
                    size="small"
                    margin="none"
                    sx={{ background: "#fff", margin: 0 }}
                    slotProps={{
                      input: {
                        "data-testid": "password",
                        autoComplete: "current-password",
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="toggle password visibility"
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                              size="small"
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
                {/* Unified alerts container above the first button */}
                {(error || recoveryError || recoverySent) && (
                  <Box sx={{ mt: 1, mb: 1 }}>
                    {!!error && (
                      <Collapse in={!!error}>
                        <Alert severity="error" data-testid="error-message" sx={{ mb: 0 }}>
                          {error}
                        </Alert>
                      </Collapse>
                    )}
                    {!!recoveryError && (
                      <Alert severity="error" sx={{ mb: 0 }}>
                        {recoveryError}
                      </Alert>
                    )}
                    {!!recoverySent && (
                      <Alert severity="success" sx={{ mb: 0 }}>
                        Recovery email sent! Please check your inbox.
                      </Alert>
                    )}
                  </Box>
                )}
                {/* Submit button group inside form */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size={formStyles.button.size}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} /> : null}
                    sx={{
                      ...formStyles.button,
                      mt: error || recoveryError || recoverySent ? 0 : 2,
                    }} // Consistent spacing with alert container handling proper margins
                    aria-label="Login to your account"
                    data-testid="submit-button"
                  >
                    {loading ? "Logging in..." : "LOGIN"}
                  </Button>
                </Box>
              </Box>
              {/* OAuth provider buttons. PR4 (#892): on org-less the
                  platform-level providers (Google / GitHub / Microsoft)
                  render unconditionally; Azure SSO stays per-tenant. */}
              {hasOAuth && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
                  <Divider sx={{ my: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      or sign in with
                    </Typography>
                  </Divider>
                  {(settings.oauthGoogleEnabled || showOrgLessOAuth("google")) && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthLogin("google")}
                      disabled={loading || oauthLoading}
                      startIcon={<GoogleIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                      data-testid="oauth-google"
                    >
                      Sign in with Google
                    </Button>
                  )}
                  {(settings.oauthGithubEnabled || showOrgLessOAuth("github")) && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthLogin("github")}
                      disabled={loading || oauthLoading}
                      startIcon={<GitHub sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                      data-testid="oauth-github"
                    >
                      Sign in with GitHub
                    </Button>
                  )}
                  {(settings.oauthMicrosoftEnabled || showOrgLessOAuth("microsoft")) && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthLogin("microsoft")}
                      disabled={loading || oauthLoading}
                      startIcon={<MicrosoftIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                      data-testid="oauth-microsoft"
                    >
                      Sign in with Microsoft
                    </Button>
                  )}
                  {settings.ssoAzureEnabled && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthLogin("azure-ad")}
                      disabled={loading || oauthLoading}
                      startIcon={<MicrosoftIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                    >
                      Sign in with Company SSO
                    </Button>
                  )}
                </Box>
              )}

              {/* Action buttons group outside form */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Button
                  type="button"
                  variant="outlined"
                  size={formStyles.button.size}
                  onClick={() => onSwitchMode && onSwitchMode("register")}
                  disabled={loading}
                  sx={{ ...formStyles.button, mt: 2 }}
                  aria-label="Switch to registration form"
                >
                  NEED AN ACCOUNT? REGISTER
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  size={formStyles.button.size}
                  onClick={handleLostPassword}
                  disabled={loading}
                  sx={formStyles.button}
                  aria-label="Lost password recovery"
                  data-testid="forgot-password-link"
                >
                  LOST PASSWORD?
                </Button>
              </Box>
              {/* #892 PR2: persistent discovery CTAs on the org-less main-domain
                  login. Same strip renders on the empty form AND on every error
                  state (wrong password, unknown email, no membership), so the
                  CTAs themselves leak nothing about which emails exist. Hidden
                  on the org-scoped subdomain login because that page is for
                  existing members of a specific tenant. */}
              {orgLess && (
                <Box
                  data-testid="login-discovery-cta"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    mt: 3,
                    pt: 2,
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                    New to BR360?
                  </Typography>
                  <Button
                    component={RouterLink}
                    to="/demo-signup"
                    variant="outlined"
                    size={formStyles.button.size}
                    sx={formStyles.button}
                    data-testid="cta-try-demo"
                  >
                    TRY THE DEMO
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/pricing"
                    variant="outlined"
                    size={formStyles.button.size}
                    sx={formStyles.button}
                    data-testid="cta-see-pricing"
                  >
                    SEE PRICING
                  </Button>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textAlign: "center", mt: 1 }}
                  >
                    Need an invite? Ask your administrator.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
      <Dialog open={lostOpen} onClose={handleCloseDialog}>
        <DialogTitle>Password Recovery</DialogTitle>
        <DialogContent>
          {recoverySent ? (
            <Alert severity="success" data-testid="success-message">
              Recovery email sent! Please check your inbox.
            </Alert>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Enter your email address to receive password recovery instructions.
              </Typography>
              <TextField
                label="Email"
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                required
                size="small"
                autoFocus
                slotProps={{ input: { "data-testid": "reset-email" } }}
              />
              {recoveryError && (
                <Alert severity="error" data-testid="error-message">
                  {recoveryError}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} variant="outlined" color="primary">
            Close
          </Button>
          {!recoverySent && (
            <Button
              onClick={handleSendRecovery}
              color="primary"
              variant="contained"
              disabled={sendingRecovery}
              startIcon={sendingRecovery ? <CircularProgress size={20} /> : null}
              data-testid="reset-button"
            >
              {sendingRecovery ? "Sending..." : isMobile ? "Recover" : "Send Recovery Email"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LoginForm;
