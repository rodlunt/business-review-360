import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  InputAdornment,
  IconButton,
  Divider,
  Chip,
  Checkbox,
  FormControlLabel,
  CircularProgress,
} from "@mui/material";
import { SPACING } from "../muiTheme";
import {
  RocketLaunch,
  Visibility,
  VisibilityOff,
  CheckCircleOutlined,
  CheckCircle,
  Cancel,
} from "@mui/icons-material";
import { api, setAuthToken } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";
import { orgPath } from "../utils/orgPath";

const TRIAL_BENEFITS = [
  "14 days free, no credit card required",
  "Up to 500 ideas and 50 team members",
  "Full analytics and priority matrix",
  "All professional features included",
];

function TrialSignupPage() {
  usePageTitle("Start Free Trial");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    orgIdDesired: "",
    adminUsername: "",
    adminEmail: "",
    adminPassword: "",
  });

  // Referral code state
  const [referralCode, setReferralCode] = useState("");
  const [referralConsent, setReferralConsent] = useState(false);
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralStatus, setReferralStatus] = useState(null); // null | { valid: boolean, consultantName?: string, companyName?: string }
  const referralTimerRef = useRef(null);

  const validateReferralCode = async (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setReferralStatus(null);
      setReferralConsent(false);
      return;
    }
    setReferralValidating(true);
    try {
      const res = await api.get(`/consultants/validate-code/${encodeURIComponent(trimmed)}`);
      setReferralStatus(res.data);
      if (!res.data.valid) {
        setReferralConsent(false);
      }
    } catch {
      // Network errors: treat as unvalidated (do not show invalid message)
      setReferralStatus(null);
    } finally {
      setReferralValidating(false);
    }
  };

  // Pre-fill referral code from ?ref= query param on mount.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref);
      validateReferralCode(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReferralChange = (e) => {
    const value = e.target.value;
    setReferralCode(value);
    // Clear previous status immediately on change
    setReferralStatus(null);
    setReferralConsent(false);
    if (referralTimerRef.current) clearTimeout(referralTimerRef.current);
    // Debounce validation slightly so we don't fire on every keystroke
    referralTimerRef.current = setTimeout(() => {
      if (value.trim()) validateReferralCode(value);
    }, 400);
  };

  const handleReferralBlur = () => {
    if (referralTimerRef.current) clearTimeout(referralTimerRef.current);
    if (referralCode.trim()) validateReferralCode(referralCode);
    else {
      setReferralStatus(null);
      setReferralConsent(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "orgIdDesired" ? value.toLowerCase().replace(/[^a-z0-9-]/g, "-") : value,
    }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let recaptchaToken = null;
      if (executeRecaptcha) {
        recaptchaToken = await executeRecaptcha("trial_signup");
      }
      const payload = {
        ...formData,
        recaptchaToken,
        ...(referralStatus?.valid ? { referralCode: referralCode.trim(), referralConsent } : {}),
      };
      const res = await api.post("/billing/trial-signup", payload);
      const { token, user } = res.data;

      // Store auth state the same way the login flow does.
      setAuthToken(token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      if (user.organizationId) localStorage.setItem("organizationId", user.organizationId);

      navigate(orgPath(user.organizationId, "home"), { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const referralHelperText = () => {
    if (referralValidating) return null;
    if (!referralCode.trim()) return null;
    if (referralStatus === null) return null;
    if (referralStatus.valid) {
      const name = referralStatus.consultantName || "your consultant";
      const company = referralStatus.companyName ? ` (${referralStatus.companyName})` : "";
      return (
        <Box
          component="span"
          sx={{ color: "success.main", display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <CheckCircle fontSize="small" />
          {`Referred by ${name}${company}. Thank you!`}
        </Box>
      );
    }
    return (
      <Box
        component="span"
        sx={{ color: "error.main", display: "flex", alignItems: "center", gap: 0.5 }}
      >
        <Cancel fontSize="small" />
        That referral code was not recognised.
      </Box>
    );
  };

  return (
    <Container maxWidth="sm" sx={{ py: SPACING.xlarge }}>
      <Box sx={{ textAlign: "center", mb: SPACING.large }}>
        <RocketLaunch sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Start your free trial
        </Typography>
        <Typography variant="body1" color="text.secondary">
          14 days free. No credit card required. Cancel any time.
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: SPACING.large, borderRadius: 2, mb: SPACING.large }}>
        <Box sx={{ display: "flex", gap: SPACING.small, flexWrap: "wrap", mb: SPACING.large }}>
          {TRIAL_BENEFITS.map((b) => (
            <Chip
              key={b}
              icon={<CheckCircleOutlined fontSize="small" />}
              label={b}
              size="small"
              variant="outlined"
              color="success"
              sx={{ fontSize: "0.75rem" }}
            />
          ))}
        </Box>

        <Divider sx={{ mb: SPACING.large }} />

        {error && (
          <Alert severity="error" sx={{ mb: SPACING.medium }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Organisation ID"
            name="orgIdDesired"
            value={formData.orgIdDesired}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
            helperText="Lowercase letters, numbers, and hyphens only. This becomes your workspace URL."
            inputProps={{ maxLength: 63 }}
          />

          <TextField
            label="Your name (username)"
            name="adminUsername"
            value={formData.adminUsername}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
          />

          <TextField
            label="Email address"
            name="adminEmail"
            type="email"
            value={formData.adminEmail}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
          />

          <TextField
            label="Password"
            name="adminPassword"
            type={showPassword ? "text" : "password"}
            value={formData.adminPassword}
            onChange={handleChange}
            fullWidth
            required
            margin="normal"
            helperText="At least 8 characters."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Referral code"
            value={referralCode}
            onChange={handleReferralChange}
            onBlur={handleReferralBlur}
            fullWidth
            margin="normal"
            placeholder="e.g. sarah-4821"
            inputProps={{ maxLength: 50 }}
            InputProps={{
              endAdornment: referralValidating ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : null,
            }}
            helperText={referralHelperText()}
            FormHelperTextProps={{ component: "div" }}
          />

          {referralStatus?.valid && (
            <FormControlLabel
              sx={{ mt: 0.5, mb: 1, alignItems: "flex-start" }}
              control={
                <Checkbox
                  checked={referralConsent}
                  onChange={(e) => setReferralConsent(e.target.checked)}
                  size="small"
                  sx={{ pt: 0.5 }}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  {`${referralStatus.consultantName || "Your consultant"}${referralStatus.companyName ? ` (${referralStatus.companyName})` : ""} referred you. Grant them admin access to view your organisation's analytics and ideas?`}
                </Typography>
              }
            />
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            sx={{ mt: SPACING.large, py: 1.5, fontWeight: 700 }}
          >
            {loading ? "Creating your workspace..." : "Start free trial"}
          </Button>
        </Box>
      </Paper>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Already have an account?{" "}
          <Link href="/org" underline="hover">
            Sign in
          </Link>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Want to see plans and pricing?{" "}
          <Link href="/pricing" underline="hover">
            View pricing
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}

export default TrialSignupPage;
