import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import { CheckCircle } from "@mui/icons-material";
import { Box, Typography, Button, Container, Paper } from "@mui/material";
import { SPACING } from "../muiTheme";
import Layout from "./Layout";
import { usePageTitle } from "../hooks/usePageTitle";

/**
 * BillingSuccess Component
 *
 * Displays a success message after successful payment/subscription via Stripe.
 * Shown at /org/:orgId/billing/success after Stripe checkout redirect.
 */
function BillingSuccess() {
  // Issue #626: page-owned document.title.
  usePageTitle("Payment Successful");

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orgId = useOrganizationId();
  const [sessionId] = useState(searchParams.get("session_id"));

  useEffect(() => {
    // Log the successful payment session for analytics
    if (sessionId) {
      console.log("[BillingSuccess] Payment successful, session:", sessionId);
    }
  }, [sessionId]);

  const handleContinue = () => {
    if (orgId) {
      navigate(orgPath(orgId, "admin"));
    } else {
      navigate("/");
    }
  };

  return (
    <Layout headerProps={{ useDefaultTheme: true }}>
      <Container maxWidth="md" sx={{ mt: SPACING.xlarge, mb: SPACING.xlarge }}>
        <Paper elevation={3} sx={{ p: SPACING.xlarge + 2, textAlign: "center" }}>
          <Box sx={{ mb: SPACING.large }}>
            <CheckCircle
              sx={{
                fontSize: 80,
                color: "success.main",
                mb: 2,
              }}
            />
          </Box>

          <Typography variant="h4" component="h1" gutterBottom sx={{ mb: SPACING.medium }}>
            Payment Successful!
          </Typography>

          <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: SPACING.large }}>
            Thank you for your subscription. Your payment has been processed successfully.
          </Typography>

          <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: SPACING.large }}>
            Your organisation is ready! Let's get started by customising your settings.
          </Typography>

          {sessionId && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ mb: SPACING.large, fontFamily: "monospace" }}
            >
              Session ID: {sessionId}
            </Typography>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={handleContinue}
            sx={{ mt: SPACING.small }}
          >
            Set Up Your Organisation
          </Button>
        </Paper>
      </Container>
    </Layout>
  );
}

export default BillingSuccess;
