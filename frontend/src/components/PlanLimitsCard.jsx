import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Button,
  Alert,
  Chip,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from "@mui/icons-material";
import { api } from "../api";

/**
 * PlanLimitsCard Component
 * Issue #354: Displays current plan limits and usage with upgrade CTA
 *
 * Shows:
 * - Current plan name
 * - Usage vs limits for ideas, users, and storage
 * - Visual progress bars with color coding
 * - Upgrade CTA when approaching limits
 */
export default function PlanLimitsCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [managingSubscription, setManagingSubscription] = useState(false);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/billing/usage");
      setData(response.data);
    } catch (err) {
      console.error("Error fetching usage data:", err);
      setError(err.response?.data?.error || "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
  }, []);

  const handleManageSubscription = async () => {
    try {
      setManagingSubscription(true);
      const orgId = localStorage.getItem("organizationId");

      const response = await api.post("/billing/customer-portal", {
        organizationId: orgId,
        returnUrl: window.location.href,
      });

      // Redirect to Stripe Customer Portal
      window.location.href = response.data.url;
    } catch (err) {
      console.error("Error opening customer portal:", err);
      setError(err.response?.data?.message || "Failed to open subscription management portal");
      setManagingSubscription(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    if (bytes === -1) return "Unlimited";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatNumber = (num) => {
    if (num === -1) return "Unlimited";
    return num.toLocaleString();
  };

  const getUsagePercent = (used, limit) => {
    if (limit === -1) return 0; // Unlimited
    if (limit === 0) return 100; // No limit allowed
    return Math.round((used / limit) * 100);
  };

  const getUsageStatus = (percent) => {
    if (percent >= 90) return { color: "error", icon: <ErrorIcon />, label: "Critical" };
    if (percent >= 75) return { color: "warning", icon: <WarningIcon />, label: "High" };
    if (percent >= 50) return { color: "info", icon: <TrendingUpIcon />, label: "Moderate" };
    return { color: "success", icon: <CheckCircleIcon />, label: "Good" };
  };

  const getPlanColor = (planName) => {
    const p = planName?.toLowerCase();
    if (p === "enterprise") return "secondary";
    if (p === "pro") return "primary";
    if (p === "business" || p === "sme") return "info";
    if (p === "trial") return "warning";
    return "default";
  };

  const getPlanLabel = (planName) => {
    const labels = {
      enterprise: "Enterprise",
      pro: "Pro",
      business: "Business",
      sme: "SME",
      trial: "Trial",
      starter: "Starter",
      free: "Free",
    };
    const key = planName?.toLowerCase();
    return labels[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Free");
  };

  const renderUsageItem = (label, used, limit, formatFn = formatNumber) => {
    const percent = getUsagePercent(used, limit);
    const status = getUsageStatus(percent);
    const isUnlimited = limit === -1;

    return (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}
          >
            {label}
            {!isUnlimited && percent >= 75 && (
              <Chip
                size="small"
                label={status.label}
                color={status.color}
                icon={status.icon}
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>{formatFn(used)}</strong> / {formatFn(limit)}
          </Typography>
        </Box>

        {!isUnlimited && (
          <LinearProgress
            variant="determinate"
            value={Math.min(percent, 100)}
            color={status.color}
            aria-label={`${label}: ${Math.round(percent)}% used`}
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: "action.hover",
            }}
          />
        )}

        {isUnlimited && (
          <Box
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: "success.light",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "success.dark" }}>
              ∞
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  if (loading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
            <CircularProgress size={40} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                Plan & Usage
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Usage stats are temporarily unavailable.
              </Typography>
            </Box>
            <Button onClick={fetchUsageData} variant="outlined" size="small">
              Retry
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { usage, limits, plan, tenantName, orgId } = data;

  // Defensive checks: ensure all required properties exist
  if (!usage || !limits || !plan) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Alert severity="error">
            Invalid usage data received. Please contact support if this persists.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const shouldShowUpgrade =
    getUsagePercent(usage.ideas, limits.maxIdeas) >= 75 ||
    getUsagePercent(usage.users, limits.maxUsers) >= 75 ||
    getUsagePercent(usage.storage, limits.maxStorage) >= 75;

  const hasPaidPlan = plan !== "free" && plan !== "starter";

  return (
    <Card variant="outlined">
      <CardContent>
        <Box
          sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              Plan & Usage
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monitor your current plan limits and usage
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <Chip label={getPlanLabel(plan)} color={getPlanColor(plan)} sx={{ fontWeight: 600 }} />
            {hasPaidPlan && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleManageSubscription}
                disabled={managingSubscription}
              >
                {managingSubscription ? "Opening..." : "Manage Subscription"}
              </Button>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Usage Metrics */}
        <Box sx={{ mt: 3 }}>
          {renderUsageItem("Ideas", usage.ideas, limits.maxIdeas)}
          {renderUsageItem("Users", usage.users, limits.maxUsers)}
          {renderUsageItem("Storage", usage.storage, limits.maxStorage, formatBytes)}
        </Box>

        {/* Upgrade CTA */}
        {shouldShowUpgrade && plan !== "enterprise" && plan !== "custom" && (
          <Alert severity="warning" sx={{ mt: 3 }} icon={<TrendingUpIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              You're approaching your plan limits
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Upgrade to a higher plan to get more capacity and avoid interruptions.
            </Typography>
            <Button
              variant="contained"
              color="warning"
              size="small"
              onClick={() => (window.location.href = "/pricing")}
              sx={{ mt: 1 }}
            >
              View Plans & Upgrade
            </Button>
          </Alert>
        )}

        {/* Enterprise Message */}
        {(plan === "enterprise" || plan === "custom") && (
          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="body2">
              Need to increase your limits? Contact your account manager or{" "}
              <a
                href="mailto:hello@br360.example.com"
                style={{ color: "inherit", fontWeight: 600 }}
              >
                reach out to us
              </a>
              .
            </Typography>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
