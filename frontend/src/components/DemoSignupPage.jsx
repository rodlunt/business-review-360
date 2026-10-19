import React, { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Link,
  Divider,
  Chip,
  CircularProgress,
} from "@mui/material";
import { PlayCircleOutlined, CheckCircleOutlined } from "@mui/icons-material";
import { api, setAuthToken } from "../api";
import { useAuth } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { orgPath } from "../utils/orgPath";

// #892 PR3: dedicated demo-corp signup page. Replaces the shared
// dcuser/dcadmin credentials as the public-facing entry to the demo
// sandbox. Each signup creates a real User row (signupSource='demo-signup')
// so leads can be followed up individually and concurrent demo users do
// not collide on shared credentials.
//
// The /try DemoAccessPage flow stays for the "no account, just look"
// case (ephemeral 2h demo token). /demo-signup is for prospects who want
// a real account they can come back to.

const DEMO_FEATURES = [
  "Explore the idea review board",
  "Try admin and user views",
  "See analytics and the priority matrix",
  "Your own account in our shared demo workspace",
];

function DemoSignupPage() {
  usePageTitle("Demo Signup");

  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  // Side-channel session-establishment path: localStorage + axios header
  // alone leaves the React tree's user=null until a reload. Call setUser to
  // commit the session in the same render cycle as the navigate. See memory
  // `feedback_demo_access_react_state_masked` (PR #885).
  const { setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // #892 PR4: secondary, visually subordinate magic-link request option.
  // Separate state from the main form above -- this is a distinct request
  // (POST /auth/magic-link, fire-and-confirm, no session established here)
  // rather than an alternate submit path for the same fields.
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkError, setMagicLinkError] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let recaptchaToken = null;
      if (executeRecaptcha) {
        recaptchaToken = await executeRecaptcha("demo_signup");
      }

      const res = await api.post("/auth/demo-signup", {
        email: email.trim(),
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        password,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      });

      const { token, user } = res.data;
      setAuthToken(token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("organizationId", "demo-corp");
      setUser(user);

      navigate(orgPath("demo-corp", "home"), { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e) => {
    e.preventDefault();
    setMagicLinkError("");
    setMagicLinkLoading(true);

    try {
      // Anti-enumeration: the backend always returns the same 200 body
      // regardless of whether the email is known, so this always shows the
      // sent-confirmation state -- there is no success/failure branch to
      // handle beyond a network/validation error.
      await api.post("/auth/magic-link", { email: magicLinkEmail.trim() });
      setMagicLinkSent(true);
    } catch (err) {
      const msg = err.response?.data?.error || "Something went wrong. Please try again.";
      setMagicLinkError(msg);
    } finally {
      setMagicLinkLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <PlayCircleOutlined sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Try Business Review 360
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create your demo account in under a minute.
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
          {DEMO_FEATURES.map((f) => (
            <Chip
              key={f}
              icon={<CheckCircleOutlined fontSize="small" />}
              label={f}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontSize: "0.75rem" }}
            />
          ))}
        </Box>

        <Divider sx={{ mb: 3 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} data-testid="error-message">
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Full name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setError("");
            }}
            required
            fullWidth
            margin="normal"
            slotProps={{ input: { "data-testid": "fullName", autoComplete: "name" } }}
          />
          <TextField
            label="Company name"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              setError("");
            }}
            required
            fullWidth
            margin="normal"
            helperText="Used only to follow up; you can change it later."
            slotProps={{ input: { "data-testid": "companyName", autoComplete: "organization" } }}
          />
          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            required
            fullWidth
            margin="normal"
            slotProps={{ input: { "data-testid": "email", autoComplete: "email" } }}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            required
            fullWidth
            margin="normal"
            helperText="At least 8 characters."
            slotProps={{
              input: { "data-testid": "password", autoComplete: "new-password" },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
            sx={{ mt: 3, py: 1.5, fontWeight: 700 }}
            data-testid="submit"
          >
            {loading ? "Creating account..." : "Create demo account"}
          </Button>
        </Box>
      </Paper>

      {/* #892 PR4: secondary, visually subordinate magic-link request.
          Deliberately smaller and lower-contrast than the Paper above it --
          the demo-signup form stays the primary path. */}
      <Box sx={{ textAlign: "center", mb: 3 }}>
        {magicLinkSent ? (
          <Alert severity="success" sx={{ textAlign: "left" }} data-testid="magic-link-sent">
            If that address can receive mail, a sign-in link is on its way. Check your inbox.
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleMagicLinkSubmit} noValidate>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Prefer a one-time link? Enter your email and we will send you guest access.
            </Typography>
            {magicLinkError && (
              <Alert severity="error" sx={{ mb: 1 }} data-testid="magic-link-error">
                {magicLinkError}
              </Alert>
            )}
            <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
              <TextField
                label="Email address"
                type="email"
                size="small"
                value={magicLinkEmail}
                onChange={(e) => {
                  setMagicLinkEmail(e.target.value);
                  setMagicLinkError("");
                }}
                required
                slotProps={{ input: { "data-testid": "magic-link-email", autoComplete: "email" } }}
              />
              <Button
                type="submit"
                variant="text"
                size="small"
                disabled={magicLinkLoading}
                data-testid="magic-link-submit"
              >
                {magicLinkLoading ? "Sending..." : "Send guest link"}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Just want a quick look without an account?{" "}
          <Link component={RouterLink} to="/try" underline="hover">
            Try the ephemeral demo
          </Link>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Already have an account?{" "}
          <Link component={RouterLink} to="/login" underline="hover">
            Sign in
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}

export default DemoSignupPage;
