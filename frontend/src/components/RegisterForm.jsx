import React, { useState, useEffect } from "react";
import useOrganizationId from "../hooks/useOrganizationId";
import { passwordsMatch } from "./passwordUtils";
import { api, API_BASE_URL } from "../api";
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
  Tooltip,
  Collapse,
  IconButton,
  InputAdornment,
} from "@mui/material";
import { GitHub, Visibility, VisibilityOff } from "@mui/icons-material";
import { getSubdomainOrgId } from "../utils/orgPath";
import { GoogleIcon, MicrosoftIcon } from "./oauthIcons";
import formStyles from "./formStyles";
// Phase 5 5d (#869): `orgLess` is set on the bare/main-domain credentials
// screen (no subdomain, no /org/:id) for the self-serve registration path.
// When set, no per-tenant settings are fetched (there is no tenant yet, so
// per-org OAuth buttons are not offered) and the backend resolves the
// shared self-serve org. On a subdomain or /org/:id this is false and the
// legacy org-scoped registration flow is byte-for-byte unchanged. Symmetric
// with LoginForm's `orgLess`.
// #892: email is the sole credential on BOTH paths -- there is no more
// anonymous (email-optional) registration, so it is unconditionally
// required here regardless of orgLess. The org-level allowAnonymousUsers
// setting this comment used to reference was retired in the same issue
// (migration 0028-drop-allow-anonymous-users.sql); guest access is now the
// magic-link flow. Username is no longer user input; the backend
// auto-generates a display name from the account's email.
function RegisterForm({ onRegister, onSwitchMode, orgIdProp, orgLess = false }) {
  const orgIdFromHook = useOrganizationId();
  const organizationId = orgIdProp || orgIdFromHook;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [confirmPasswordFocus, setConfirmPasswordFocus] = useState(false);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Org-less screen has no tenant: do not fetch a (possibly stale
        // localStorage) org's branding/OAuth.
        if (orgLess) return;
        const resolvedOrgId =
          getSubdomainOrgId() || organizationId || localStorage.getItem("organizationId");
        if (!resolvedOrgId) return;
        const res = await api.get(`/settings/organization/${resolvedOrgId}/public`, {
          skipOrganizationId: true,
        });
        setSettings(res.data);
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, [organizationId, orgLess]);

  function handleOAuthSignUp(provider) {
    const orgId = getSubdomainOrgId() || organizationId || localStorage.getItem("organizationId");
    if (!orgId) {
      setError("No organisation selected. Please refresh the page.");
      return;
    }
    setOauthLoading(true);
    window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}?org=${encodeURIComponent(orgId)}`;
  }

  const hasOAuth =
    settings.oauthGoogleEnabled ||
    settings.oauthGithubEnabled ||
    settings.oauthMicrosoftEnabled ||
    settings.ssoAzureEnabled;

  // Password criteria checks (same as SuperuserSetup)
  const hasLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasCapital = /[A-Z]/.test(password);
  const hasSpecial = /[@$!%*?&]/.test(password);
  const passwordCriteriaMet = hasLength && hasNumber && hasLetter && hasCapital && hasSpecial;

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Register submit", {
      email,
      password,
      confirmPassword,
    });
    setError("");
    if (!passwordCriteriaMet) {
      setError("Password does not meet criteria.");
      setLoading(false);
      return;
    }
    if (!passwordsMatch(password, confirmPassword)) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }
    setLoading(true);

    if (onRegister) {
      // Use organizationId from URL route (e.g., /org/tradezone/login)
      console.log(
        "[RegisterForm] Submitting registration with organizationId from URL:",
        organizationId
      );
      onRegister(email, password, organizationId, referralCode)
        .catch((err) =>
          setError(err?.response?.data?.error || err.message || "Registration failed.")
        )
        .finally(() => setLoading(false));
    }
  };

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
              <Typography {...formStyles.title}>Register</Typography>
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
                {/* Email group */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter email"
                    margin="none"
                    size={formStyles.input.size}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                    sx={{ margin: 0 }}
                    slotProps={{ input: { "data-testid": "email" } }}
                  />
                  {orgLess && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                      data-testid="orgless-register-hint"
                    >
                      Your email is your account. Single sign-on accounts are created through your
                      organisation's sign-in page, not here.
                    </Typography>
                  )}
                </Box>
                {/* Referral code group (optional, Phase 3 Slice 1) */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <TextField
                    label="Referral code (optional)"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Enter a referral code if you have one"
                    margin="none"
                    size={formStyles.input.size}
                    sx={{ margin: 0 }}
                    slotProps={{ input: { "data-testid": "referralCode" } }}
                  />
                </Box>
                {/* Password group */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                  }}
                >
                  <TextField
                    label="Password *"
                    type={showPassword ? "text" : "password"}
                    variant="outlined"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    slotProps={{
                      inputLabel: { required: false },
                      input: {
                        "data-testid": "password",
                        autoComplete: "new-password",
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
                    onFocus={() => setPasswordFocus(true)}
                    onBlur={() => setPasswordFocus(false)}
                    size={formStyles.input.size}
                    sx={{ margin: 0 }}
                  />
                </Box>
                {/* Confirm Password group */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    mb: !(
                      emailFocus ||
                      (passwordFocus && password.length > 0) ||
                      (confirmPasswordFocus &&
                        confirmPassword.length > 0 &&
                        !passwordsMatch(password, confirmPassword)) ||
                      !!error
                    )
                      ? 2
                      : 0,
                  }}
                >
                  <TextField
                    label="Confirm Password *"
                    type={showConfirmPassword ? "text" : "password"}
                    variant="outlined"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    slotProps={{
                      inputLabel: { required: false },
                      input: {
                        "data-testid": "confirmPassword",
                        autoComplete: "new-password",
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="toggle confirm password visibility"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              edge="end"
                              size="small"
                            >
                              {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                    size={formStyles.input.size}
                    onFocus={() => setConfirmPasswordFocus(true)}
                    onBlur={() => setConfirmPasswordFocus(false)}
                    sx={{ margin: 0 }}
                  />
                </Box>
                {/* Alerts container appears after confirm password input, before buttons */}
                {(emailFocus ||
                  (passwordFocus && password.length > 0) ||
                  (confirmPasswordFocus &&
                    confirmPassword.length > 0 &&
                    !passwordsMatch(password, confirmPassword)) ||
                  !!error) && (
                  <Box>
                    {passwordFocus && password.length > 0 && (
                      <Alert severity={passwordCriteriaMet ? "success" : "info"}>
                        {passwordCriteriaMet ? (
                          "Password meets criteria."
                        ) : (
                          <>
                            {!hasLength && <div>Must be at least 8 characters.</div>}
                            {!hasNumber && <div>Must have 1 number.</div>}
                            {!hasLetter && <div>Must have 1 letter.</div>}
                            {!hasCapital && <div>Must have 1 capital letter.</div>}
                            {!hasSpecial && <div>Must have 1 special character (@$!%*?&).</div>}
                          </>
                        )}
                      </Alert>
                    )}
                    {confirmPasswordFocus &&
                      confirmPassword.length > 0 &&
                      !passwordsMatch(password, confirmPassword) && (
                        <Alert severity="error" aria-live="assertive">
                          Passwords do not match.
                        </Alert>
                      )}
                    {!!error && (
                      <Collapse in={!!error}>
                        <Alert severity="error" aria-live="assertive" data-testid="error-message">
                          {error}
                        </Alert>
                      </Collapse>
                    )}
                  </Box>
                )}
                {/* Submit button group inside form */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size={formStyles.button.size}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} /> : null}
                    sx={{
                      ...formStyles.button,
                      mt:
                        emailFocus ||
                        (passwordFocus && password.length > 0) ||
                        (confirmPasswordFocus &&
                          confirmPassword.length > 0 &&
                          !passwordsMatch(password, confirmPassword)) ||
                        !!error
                          ? 0
                          : 0.5,
                    }} // 32px gap when no alert, 0px when alert present (alert handles spacing)
                    aria-label="Register a new account"
                    data-testid="submit-button"
                  >
                    {loading ? "Registering..." : "REGISTER"}
                  </Button>
                </Box>
              </Box>
              {/* OAuth provider buttons */}
              {hasOAuth && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
                  <Divider sx={{ my: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      or sign up with
                    </Typography>
                  </Divider>
                  {settings.oauthGoogleEnabled && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthSignUp("google")}
                      disabled={loading || oauthLoading}
                      startIcon={<GoogleIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                    >
                      Sign up with Google
                    </Button>
                  )}
                  {settings.oauthGithubEnabled && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthSignUp("github")}
                      disabled={loading || oauthLoading}
                      startIcon={<GitHub sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                    >
                      Sign up with GitHub
                    </Button>
                  )}
                  {settings.oauthMicrosoftEnabled && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthSignUp("microsoft")}
                      disabled={loading || oauthLoading}
                      startIcon={<MicrosoftIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                    >
                      Sign up with Microsoft
                    </Button>
                  )}
                  {settings.ssoAzureEnabled && (
                    <Button
                      variant="outlined"
                      size={formStyles.button.size}
                      onClick={() => handleOAuthSignUp("azure-ad")}
                      disabled={loading || oauthLoading}
                      startIcon={<MicrosoftIcon sx={{ width: 18, height: 18 }} />}
                      sx={formStyles.button}
                    >
                      Sign up with Company SSO
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
                  onClick={() => onSwitchMode && onSwitchMode("login")}
                  disabled={loading}
                  sx={{ ...formStyles.button, mt: 2 }}
                  aria-label="Switch to login form"
                >
                  ALREADY HAVE AN ACCOUNT? LOGIN
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}

export default RegisterForm;
