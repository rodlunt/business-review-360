import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import { CheckCircle, Cancel } from "@mui/icons-material";
import { SPACING } from "../muiTheme";
import { ShoppingCart } from "@mui/icons-material";
import { api } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";

/**
 * CheckoutForm Component
 *
 * Customer sign-up and billing information collection form.
 * Shown at /signup for new customers to create an account and subscribe.
 * Integrates with Stripe for payment processing.
 */
function CheckoutForm() {
  // Issue #626: page-owned document.title.
  usePageTitle("Sign Up");

  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    organizationName: "",
    organizationId: "",
    email: "",
    firstName: "",
    lastName: "",
    planId: "",
    billingInterval: "monthly",
  });

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);
  const [searchParams] = useSearchParams();

  const [referralCode, setReferralCode] = useState("");
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralStatus, setReferralStatus] = useState(null);
  const referralTimerRef = useRef(null);

  const validateReferralCode = async (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setReferralStatus(null);
      return;
    }
    setReferralValidating(true);
    try {
      const res = await api.get(`/consultants/validate-code/${encodeURIComponent(trimmed)}`);
      setReferralStatus(res.data);
    } catch {
      setReferralStatus(null);
    } finally {
      setReferralValidating(false);
    }
  };

  const handleReferralChange = (e) => {
    const value = e.target.value;
    setReferralCode(value);
    setReferralStatus(null);
    if (referralTimerRef.current) clearTimeout(referralTimerRef.current);
    referralTimerRef.current = setTimeout(() => {
      if (value.trim()) validateReferralCode(value);
    }, 400);
  };

  const handleReferralBlur = () => {
    if (referralTimerRef.current) clearTimeout(referralTimerRef.current);
    if (referralCode.trim()) validateReferralCode(referralCode);
    else setReferralStatus(null);
  };

  const referralHelperText = () => {
    if (referralValidating || !referralCode.trim() || referralStatus === null) return null;
    if (referralStatus.valid) {
      const name = referralStatus.consultantName || "your consultant";
      const company = referralStatus.companyName ? ` (${referralStatus.companyName})` : "";
      return (
        <Box
          component="span"
          sx={{ color: "success.main", display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <CheckCircle fontSize="small" />
          {`Referred by ${name}${company}.`}
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setPlansLoading(true);
        const res = await api.get("/billing/plans");
        if (cancelled) return;
        const list = res.data?.plans ?? [];
        setPlans(list);
        setPlansError(null);

        const requested = searchParams.get("plan");
        const initial =
          list.find((p) => p.plan_code === requested)?.plan_code || list[0]?.plan_code || "";
        const requestedInterval = searchParams.get("interval");
        const initialInterval = requestedInterval === "yearly" ? "yearly" : "monthly";
        if (initial) {
          setFormData((prev) => ({
            ...prev,
            planId: initial,
            billingInterval: initialInterval,
          }));
        } else {
          setFormData((prev) => ({ ...prev, billingInterval: initialInterval }));
        }

        const ref = searchParams.get("ref");
        if (ref) {
          setReferralCode(ref);
          validateReferralCode(ref);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[CheckoutForm] Failed to load plans", err);
        setPlansError("Could not load pricing plans.");
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Call backend API to create Stripe Checkout Session via the shared
      // axios client so VITE_API_URL routing applies in every environment.
      const response = await api.post("/billing/checkout", {
        planId: formData.planId,
        orgIdDesired: formData.organizationId,
        adminEmail: formData.email,
        // organizationId is also retained so any future backend change that
        // reads it directly continues to work without another wiring fix.
        organizationId: formData.organizationId,
        organizationName: formData.organizationName,
        firstName: formData.firstName,
        lastName: formData.lastName,
        billingInterval: formData.billingInterval,
        ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
      });

      const { sessionUrl } = response.data;

      // Redirect to Stripe Checkout
      if (sessionUrl) {
        window.location.href = sessionUrl;
      } else {
        throw new Error("No checkout session URL received");
      }
    } catch (err) {
      console.error("[CheckoutForm] Error:", err);
      const message =
        err.response?.data?.error || err.message || "Failed to process checkout. Please try again.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: SPACING.xlarge, mb: SPACING.xlarge }}>
      <Paper elevation={3} sx={{ p: SPACING.large }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: SPACING.large }}>
          <ShoppingCart sx={{ fontSize: 40, color: "primary.main", mr: 2 }} />
          <Typography variant="h4" component="h1">
            Sign Up for Business Review 360
          </Typography>
        </Box>

        <Typography variant="body1" color="text.secondary" paragraph>
          Create your account and subscribe to start collecting valuable feedback from your team.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: SPACING.large }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <TextField
                required
                fullWidth
                label="Organisation Name"
                name="organizationName"
                value={formData.organizationName}
                onChange={handleChange}
                helperText="The name of your company or team"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                required
                fullWidth
                label="Organisation ID"
                name="organizationId"
                value={formData.organizationId}
                onChange={handleChange}
                helperText="Unique identifier (lowercase, no spaces, e.g., acme-corp)"
                inputProps={{ pattern: "^[a-z0-9-]+$" }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                required
                fullWidth
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                required
                fullWidth
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                required
                fullWidth
                type="email"
                label="Email Address"
                name="email"
                value={formData.email}
                onChange={handleChange}
                helperText="You'll use this to sign in"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Referral code (optional)"
                value={referralCode}
                onChange={handleReferralChange}
                onBlur={handleReferralBlur}
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
            </Grid>

            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth required disabled={plansLoading || !!plansError}>
                <InputLabel id="plan-label" htmlFor="plan-select">
                  Plan
                </InputLabel>
                <Select
                  labelId="plan-label"
                  id="plan-select"
                  name="planId"
                  value={formData.planId}
                  onChange={handleChange}
                  label="Plan"
                >
                  {plans.map((p) => (
                    <MenuItem key={p.plan_code} value={p.plan_code}>
                      {`${p.plan_name} - $${(p.monthly_price / 100).toFixed(2)}/month inc GST`}
                    </MenuItem>
                  ))}
                </Select>
                {plansLoading && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    Loading plans...
                  </Typography>
                )}
                {plansError && (
                  <Alert
                    severity="error"
                    sx={{ mt: 1 }}
                    action={
                      <Button size="small" onClick={() => window.location.reload()}>
                        Retry
                      </Button>
                    }
                  >
                    {plansError}
                  </Alert>
                )}
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading || plansLoading || !!plansError || !formData.planId}
                sx={{ mt: SPACING.small }}
              >
                {loading ? "Processing..." : "Continue to Payment"}
              </Button>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary" align="center" display="block">
                You will be redirected to Stripe to securely enter your payment information.
              </Typography>
            </Grid>
          </Grid>
        </form>

        <Box sx={{ mt: SPACING.large, textAlign: "center" }}>
          <Button onClick={() => navigate("/pricing")} color="inherit">
            Back to Pricing
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default CheckoutForm;
