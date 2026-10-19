import React from "react";
import { Alert, Button, Box, Typography } from "@mui/material";
import { AccessTime } from "@mui/icons-material";

/**
 * TrialBanner
 *
 * Shows a sticky banner inside the authenticated app when the tenant is on a
 * free trial. Switches from info to warning when <= 3 days remain, and to
 * error when the trial has expired.
 *
 * Props:
 *   trialEndsAt  string   ISO date string from /auth/me
 *   trialExpired boolean  true when status = trial_expired
 */
function TrialBanner({ trialEndsAt, trialExpired }) {
  if (!trialEndsAt && !trialExpired) return null;

  const daysRemaining = trialEndsAt
    ? Math.max(0, Math.round((new Date(trialEndsAt) - Date.now()) / 86_400_000))
    : 0;

  const severity =
    trialExpired || daysRemaining === 0 ? "error" : daysRemaining <= 3 ? "warning" : "info";

  const message =
    trialExpired || daysRemaining === 0
      ? "Your free trial has expired. Your account is now read-only."
      : daysRemaining === 1
        ? "Your free trial expires tomorrow."
        : `Your free trial expires in ${daysRemaining} days.`;

  return (
    <Alert
      severity={severity}
      icon={<AccessTime fontSize="small" />}
      sx={{ borderRadius: 0, py: 0.5 }}
      action={
        <Button
          color="inherit"
          size="small"
          variant="outlined"
          href="/pricing"
          sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
        >
          Upgrade now
        </Button>
      }
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" fontWeight={500}>
          {message}
        </Typography>
      </Box>
    </Alert>
  );
}

export default TrialBanner;
