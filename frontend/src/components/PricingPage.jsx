import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Container,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Grid,
  Card,
  CardContent,
  CardActions,
  Box,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Slider,
  InputAdornment,
  TextField,
  Divider,
  Tooltip,
  IconButton,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import CheckIcon from "@mui/icons-material/Check";
import RemoveIcon from "@mui/icons-material/Remove";
import { api } from "../api";
import ContactSalesModal from "./ContactSalesModal";
import { usePageTitle } from "../hooks/usePageTitle";

/**
 * PricingPage Component
 *
 * Public /pricing route. Lists plans from /billing/plans, lets the user
 * pick monthly or yearly billing, and routes:
 *   - Free  -> https://demo-corp.br360.example.com/register
 *   - Pro   -> /signup?plan=<code>&interval=<monthly|yearly>
 *   - Custom/Enterprise -> ContactSalesModal
 */
const PricingPage = () => {
  // Issue #626: page-owned document.title.
  usePageTitle("Pricing");

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get("/billing/plans");
        if (cancelled) return;
        setPlans(response.data.plans);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching plans:", err);
        setError("Failed to load pricing plans. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const retryFetchPlans = () => setRetryCount((c) => c + 1);

  const formatPrice = (priceInCents) => {
    if (priceInCents === 0) return "Free";
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  const formatLimit = (value) => {
    if (value === -1) return "Unlimited";
    if (value >= 1073741824) return `${(value / 1073741824).toFixed(0)} GB`;
    if (value >= 1048576) return `${(value / 1048576).toFixed(0)} MB`;
    return value.toLocaleString();
  };

  const formatFeatureName = (feature) => {
    const featureNames = {
      core_features: "Idea management & voting",
      advanced_analytics: "Priority matrix & ROI calculator",
      priority_support: "Priority email support",
      export_reports: "Export reports (PDF/CSV)",
      dedicated_support: "Dedicated support manager",
      api_access: "API access",
      white_label: "White label option",
      custom_branding: "Custom branding",
      community_support: "Community support",
      custom_deployment: "On-premise deployment",
      sla: "99.9% uptime SLA",
    };
    return featureNames[feature] || feature;
  };

  const handleSelectPlan = (planCode) => {
    if (planCode === "custom" || planCode === "enterprise") {
      setSelectedPlan(planCode);
      setContactModalOpen(true);
      return;
    }
    if (planCode === "free") {
      // #892 PR3 follow-up: route free-tier prospects through /demo-signup so
      // they create a real (per-prospect) account rather than landing on the
      // legacy register form on demo-corp's subdomain.
      window.location.href = "/demo-signup";
      return;
    }
    window.location.href = `/signup?plan=${planCode}&interval=${billingInterval}`;
  };

  const handleContactModalClose = () => {
    setContactModalOpen(false);
    setSelectedPlan("");
  };

  const ctaLabel = (plan) => {
    if (plan.plan_code === "custom" || plan.plan_code === "enterprise") return "Contact sales";
    if (plan.plan_code === "free") return "See it in action";
    return "Get started";
  };

  if (loading) {
    return (
      <Container sx={{ py: 12, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ py: 12 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retryFetchPlans}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={6}>
        {/* Header */}
        <Stack spacing={2} alignItems="center" sx={{ textAlign: "center" }}>
          <Typography variant="h1" component="h1">
            Choose the right plan for your team
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Start with our free plan and upgrade as you grow
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              exclusive
              value={billingInterval}
              onChange={(_, next) => next && setBillingInterval(next)}
              size="small"
              aria-label="Billing interval"
            >
              <ToggleButton value="monthly">Monthly</ToggleButton>
              <ToggleButton value="yearly">Annually</ToggleButton>
            </ToggleButtonGroup>
            <Chip color="success" label="Save 15%" size="small" />
          </Stack>
        </Stack>

        {/* Cards */}
        <Grid container spacing={3}>
          {plans.map((plan) => {
            const price = billingInterval === "yearly" ? plan.yearly_price : plan.monthly_price;
            const isPopular = plan.plan_code === "pro";
            const isCustom = plan.plan_code === "custom" || plan.plan_code === "enterprise";
            return (
              <Grid key={plan.plan_code} size={{ xs: 12, md: 6, lg: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    borderColor: isPopular ? "primary.main" : "divider",
                    borderWidth: isPopular ? 2 : 1,
                  }}
                >
                  {isPopular && (
                    <Chip
                      color="primary"
                      label="Popular"
                      size="small"
                      sx={{ position: "absolute", top: 12, right: 12 }}
                    />
                  )}
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h5" component="h2" gutterBottom>
                      {plan.plan_name}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minHeight: 48, mb: 2 }}
                    >
                      {plan.description}
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      {isCustom ? (
                        <Typography variant="h4">Contact us</Typography>
                      ) : (
                        <>
                          <Typography variant="h4">
                            {formatPrice(price)}
                            {price > 0 ? " inc GST" : ""}
                          </Typography>
                          {price > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {billingInterval === "yearly" ? "Annually" : "Monthly"}
                            </Typography>
                          )}
                        </>
                      )}
                    </Box>

                    <List dense disablePadding>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckCircleOutlineIcon fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <span>
                              <strong>{formatLimit(plan.limits.maxIdeas)}</strong> ideas
                            </span>
                          }
                        />
                      </ListItem>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckCircleOutlineIcon fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <span>
                              <strong>{formatLimit(plan.limits.maxUsers)}</strong> users
                            </span>
                          }
                        />
                      </ListItem>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckCircleOutlineIcon fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <span>
                              <strong>{formatLimit(plan.limits.maxStorage)}</strong> storage
                            </span>
                          }
                        />
                      </ListItem>
                      {plan.features.map((feature) => (
                        <ListItem key={feature} disableGutters>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <CheckCircleOutlineIcon fontSize="small" color="primary" />
                          </ListItemIcon>
                          <ListItemText primary={formatFeatureName(feature)} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      fullWidth
                      variant={isPopular ? "contained" : "outlined"}
                      onClick={() => handleSelectPlan(plan.plan_code)}
                      aria-label={`${ctaLabel(plan)} (${plan.plan_name})`}
                    >
                      {ctaLabel(plan)}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {/* Issue #530: ROI calculator */}
        <RoiCalculator />

        {/* Issue #532: Feature-comparison table */}
        <FeatureComparisonTable />

        {/* Footer CTA */}
        <Stack spacing={1} alignItems="center" sx={{ textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Explore the full platform on our demo organisation before you commit.
          </Typography>
          <Typography variant="body2">
            Need help choosing?{" "}
            <Link
              component="button"
              type="button"
              onClick={() => setContactModalOpen(true)}
              underline="hover"
            >
              Contact our sales team
            </Link>
          </Typography>
        </Stack>
      </Stack>

      <ContactSalesModal
        open={contactModalOpen}
        onClose={handleContactModalClose}
        preselectedPlan={selectedPlan}
      />
    </Container>
  );
};

// ---------------------------------------------------------------------------
// ROI Calculator (Issue #530)
// ---------------------------------------------------------------------------

/**
 * Model assumptions (conservative):
 *   Each idea submitted requires approx. 15 min (0.25 h) of each team
 *   member's time for review, voting, and follow-up that would otherwise
 *   happen in meetings or email threads. BR360 moves this to async, saving
 *   that time.
 *
 *   monthly_hours_saved  = ideas_per_month * team_size * 0.25
 *   annual_hours_saved   = monthly_hours_saved * 12
 *   annual_dollar_savings = annual_hours_saved * hourly_rate
 *   payback_months       = plan_monthly_cost / (annual_dollar_savings / 12)
 *
 *   Plan cost baseline: SME plan at AUD $29.95/month.
 */
const HOURS_PER_IDEA_PER_PERSON = 0.25;
const PLAN_MONTHLY_COST_AUD = 29.95;

const ROI_DEFAULTS = { team: 10, rate: 75, ideas: 20 };

function parseRoiParam(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return Math.round(n);
}

function calcRoi(team, rate, ideas) {
  const monthlyHours = ideas * team * HOURS_PER_IDEA_PER_PERSON;
  const annualHours = monthlyHours * 12;
  const annualSavings = annualHours * rate;
  const monthlySavings = annualSavings / 12;
  const payback = monthlySavings > 0 ? PLAN_MONTHLY_COST_AUD / monthlySavings : null;
  return { monthlyHours, annualHours, annualSavings, payback };
}

function fmt(n) {
  return n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
}

function fmtCurrency(n) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function RoiCalculator() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [team, setTeam] = useState(() =>
    parseRoiParam(searchParams.get("team"), ROI_DEFAULTS.team, 1, 500)
  );
  const [rate, setRate] = useState(() =>
    parseRoiParam(searchParams.get("rate"), ROI_DEFAULTS.rate, 1, 500)
  );
  const [ideas, setIdeas] = useState(() =>
    parseRoiParam(searchParams.get("ideas"), ROI_DEFAULTS.ideas, 1, 500)
  );
  const [copied, setCopied] = useState(false);

  const syncUrl = useCallback(
    (t, r, i) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("team", t);
          next.set("rate", r);
          next.set("ideas", i);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleTeam = (v) => {
    setTeam(v);
    syncUrl(v, rate, ideas);
  };
  const handleRate = (v) => {
    setRate(v);
    syncUrl(team, v, ideas);
  };
  const handleIdeas = (v) => {
    setIdeas(v);
    syncUrl(team, rate, v);
  };

  const { annualHours, annualSavings, payback } = calcRoi(team, rate, ideas);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const paybackLabel =
    payback === null
      ? "N/A"
      : payback < 0.1
        ? "< 1 day"
        : payback < 1
          ? `${Math.round(payback * 30)} days`
          : `${payback.toFixed(1)} months`;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 3 }}>
        <Typography variant="h5" component="h2" sx={{ textAlign: "center" }}>
          Calculate your ROI
        </Typography>
        <Tooltip title="Based on 15 min saved per team member per idea processed, vs. equivalent meeting and email overhead.">
          <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", cursor: "help" }} />
        </Tooltip>
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 } }}>
        <Grid container spacing={4} alignItems="flex-start">
          {/* Inputs */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={4}>
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    Team size
                  </Typography>
                  <Typography variant="body2" color="primary.main" fontWeight={700}>
                    {team} people
                  </Typography>
                </Stack>
                <Slider
                  value={team}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(_, v) => handleTeam(v)}
                  aria-label="Team size"
                  marks={[
                    { value: 1, label: "1" },
                    { value: 50, label: "50" },
                    { value: 100, label: "100" },
                    { value: 200, label: "200" },
                  ]}
                />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    Average hourly rate
                  </Typography>
                  <Typography variant="body2" color="primary.main" fontWeight={700}>
                    ${rate}/hr
                  </Typography>
                </Stack>
                <Slider
                  value={rate}
                  min={20}
                  max={300}
                  step={5}
                  onChange={(_, v) => handleRate(v)}
                  aria-label="Hourly rate"
                  marks={[
                    { value: 20, label: "$20" },
                    { value: 100, label: "$100" },
                    { value: 200, label: "$200" },
                    { value: 300, label: "$300" },
                  ]}
                />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    Ideas processed per month
                  </Typography>
                  <Typography variant="body2" color="primary.main" fontWeight={700}>
                    {ideas} ideas
                  </Typography>
                </Stack>
                <Slider
                  value={ideas}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(_, v) => handleIdeas(v)}
                  aria-label="Ideas per month"
                  marks={[
                    { value: 1, label: "1" },
                    { value: 50, label: "50" },
                    { value: 100, label: "100" },
                    { value: 200, label: "200" },
                  ]}
                />
              </Box>
            </Stack>
          </Grid>

          {/* Outputs */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={0}
              sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 2, p: 3 }}
            >
              <Stack spacing={3}>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    Hours saved per year
                  </Typography>
                  <Typography variant="h3" component="p" fontWeight={700} data-testid="roi-hours">
                    {fmt(annualHours)}
                  </Typography>
                </Box>

                <Divider sx={{ borderColor: "rgba(255,255,255,0.2)" }} />

                <Box>
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    Estimated annual savings
                  </Typography>
                  <Typography variant="h3" component="p" fontWeight={700} data-testid="roi-savings">
                    {fmtCurrency(annualSavings)}
                  </Typography>
                </Box>

                <Divider sx={{ borderColor: "rgba(255,255,255,0.2)" }} />

                <Box>
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    Payback period
                  </Typography>
                  <Typography variant="h4" component="p" fontWeight={700} data-testid="roi-payback">
                    {paybackLabel}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    vs. SME plan at {fmtCurrency(PLAN_MONTHLY_COST_AUD)}/mo
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Tooltip title={copied ? "Copied!" : "Copy shareable link"}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={handleCopy}
                  aria-label="Copy shareable link"
                >
                  {copied ? "Copied!" : "Share this estimate"}
                </Button>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Feature comparison table (Issue #532)
// ---------------------------------------------------------------------------

const TIERS = ["SME", "Professional", "Enterprise"];

const FEATURE_GROUPS = [
  {
    group: "Core",
    rows: [
      { label: "Ideas", values: ["100", "500", "Unlimited"] },
      { label: "Team members", values: ["10", "50", "Unlimited"] },
      { label: "Storage", values: ["1 GB", "5 GB", "Unlimited"] },
      { label: "Idea management & voting", values: [true, true, true] },
    ],
  },
  {
    group: "Analytics",
    rows: [
      { label: "Analytics dashboard", values: [false, true, true] },
      { label: "Priority matrix", values: [false, true, true] },
      { label: "Export reports (PDF/CSV)", values: [false, true, true] },
    ],
  },
  {
    group: "Admin",
    rows: [
      { label: "Custom branding", values: [false, false, true] },
      { label: "API access", values: [false, false, true] },
      { label: "On-premise deployment", values: [false, false, true] },
      { label: "Custom integrations", values: [false, false, true] },
    ],
  },
  {
    group: "Support",
    rows: [
      { label: "Email support", values: [true, true, true] },
      { label: "Priority support", values: [false, true, true] },
      { label: "Dedicated manager", values: [false, false, true] },
      { label: "99.9% uptime SLA", values: [false, false, true] },
    ],
  },
];

function FeatureCell({ value }) {
  if (value === true) return <CheckIcon fontSize="small" color="success" aria-label="Included" />;
  if (value === false)
    return (
      <RemoveIcon fontSize="small" sx={{ color: "text.disabled" }} aria-label="Not included" />
    );
  return (
    <Typography variant="body2" fontWeight={500}>
      {value}
    </Typography>
  );
}

function FeatureComparisonTable() {
  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom sx={{ textAlign: "center", mb: 3 }}>
        Compare plans
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" aria-label="Feature comparison">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "40%", fontWeight: 700 }}>Feature</TableCell>
              {TIERS.map((tier) => (
                <TableCell key={tier} align="center" sx={{ fontWeight: 700, minWidth: 110 }}>
                  {tier}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {FEATURE_GROUPS.map(({ group, rows }) => (
              <React.Fragment key={group}>
                <TableRow>
                  <TableCell
                    colSpan={4}
                    sx={{
                      bgcolor: "action.hover",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "text.secondary",
                      py: 0.75,
                    }}
                  >
                    {group}
                  </TableCell>
                </TableRow>
                {rows.map((row) => (
                  <TableRow key={row.label} hover>
                    <TableCell sx={{ color: "text.primary" }}>{row.label}</TableCell>
                    {row.values.map((val, i) => (
                      <TableCell key={i} align="center">
                        <FeatureCell value={val} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default PricingPage;
