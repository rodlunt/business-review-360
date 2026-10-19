import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import Footer from "./Footer";
import { api } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";

// Phase 3 Slice 3 (#851): the consultant activation email links to the same
// /reset-password flow (it already auto-logs-in; no separate activation page,
// plan locked decision #1) but carries &activation=1. When present we show
// activation-flavoured copy. Mechanics (token + new password -> auto-login)
// are identical either way.
const ACTIVATION_COPY = {
  pageTitle: "Activate Your Account",
  heading: "Activate Your Account",
  tokenMissing: "Activation token is required (from your invitation email).",
  success: "Account activated! Logging you in...",
  submit: "Activate Account",
  tokenLabel: "Activation Token",
};
const RESET_COPY = {
  pageTitle: "Reset Password",
  heading: "Reset Your Password",
  tokenMissing: "Reset token is required (from your email link).",
  success: "Password reset successful! Logging you in...",
  submit: "Reset Password",
  tokenLabel: "Reset Token",
};

function LostPasswordForm({ onSuccess }) {
  const { executeRecaptcha } = useGoogleReCaptcha();
  // Auto-fill token from URL if present
  const urlParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialToken = urlParams ? urlParams.get("token") || "" : "";
  const isActivation = urlParams ? urlParams.get("activation") === "1" : false;
  const copy = isActivation ? ACTIVATION_COPY : RESET_COPY;
  // Issue #626: page-owned document.title.
  usePageTitle(copy.pageTitle);
  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
    token: initialToken,
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState({ useCaptcha: true });

  // Fetch per-tenant settings so we know whether to execute reCAPTCHA on
  // submit. Mirrors the RegisterForm pattern (#476, #559).
  useEffect(() => {
    const fetchSettings = async () => {
      // Issue #546: bare /settings is deprecated. Without an orgId we keep
      // the default useCaptcha state set above.
      try {
        const orgId = localStorage.getItem("organizationId");
        if (!orgId) return;
        const res = await api.get(`/settings/organization/${orgId}`);
        setSettings(res.data);
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, []);

  const captchaEnabled = settings.useCaptcha !== "false" && settings.useCaptcha !== false;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.token) {
      setError(copy.tokenMissing);
      setLoading(false);
      return;
    }
    if (!form.password || !form.confirmPassword) {
      setError("Please enter and confirm your new password.");
      setLoading(false);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    // Issue #559: attach reCAPTCHA token when tenant captcha is on.
    let recaptchaToken = null;
    if (captchaEnabled && executeRecaptcha) {
      try {
        recaptchaToken = await executeRecaptcha("password_reset");
      } catch (err) {
        console.error("reCAPTCHA error:", err);
        setError("CAPTCHA verification failed. Please try again.");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await api.post("/auth/reset-password", {
        token: form.token,
        password: form.password,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      });
      if (res.data && res.data.success) {
        // Store token and user info for auto-login
        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
        }
        if (res.data.user) {
          localStorage.setItem("user", JSON.stringify(res.data.user));
        }
        setSuccess(true);
        // Redirect to app after a brief delay to show success message
        setTimeout(() => {
          onSuccess && onSuccess();
        }, 2000);
      } else {
        setError(res.data?.error || "Failed to reset password.");
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to reset password. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          pt: "10vh",
        }}
      >
        <Card sx={{ width: "100%", maxWidth: 400, p: 2 }}>
          <CardContent>
            <Typography variant="h5" align="center" fontWeight={700} mb={2}>
              {copy.heading}
            </Typography>
            {success ? (
              <Alert severity="success" data-testid="success-message">
                {copy.success}
              </Alert>
            ) : (
              <Box
                component="form"
                onSubmit={handleSubmit}
                aria-label="Lost password reset form"
                sx={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <TextField
                  label={copy.tokenLabel}
                  name="token"
                  value={form.token}
                  onChange={handleChange}
                  required
                  placeholder="Paste the token from your email link"
                  size="small"
                  slotProps={{ input: { "data-testid": "reset-token" } }}
                />
                <TextField
                  label="New Password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="Enter new password"
                  size="small"
                  slotProps={{ input: { "data-testid": "new-password" } }}
                />
                <TextField
                  label="Confirm New Password"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="Confirm new password"
                  size="small"
                  slotProps={{ input: { "data-testid": "confirm-new-password" } }}
                />
                {error && (
                  <Box aria-live="assertive">
                    <Alert
                      severity="error"
                      sx={{
                        mt: 2,
                        width: "100%",
                        boxSizing: "border-box",
                        maxWidth: "100%",
                      }}
                    >
                      {error}
                    </Alert>
                  </Box>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  variant="contained"
                  color="primary"
                  sx={{ mt: 2 }}
                  data-testid="reset-password-submit"
                >
                  {loading ? <CircularProgress size={20} /> : copy.submit}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
      <Footer />
    </Box>
  );
}

export default LostPasswordForm;
