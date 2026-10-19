import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Cancel } from "@mui/icons-material";
import { Box, Typography, Button, Container, Paper } from "@mui/material";
import Layout from "./Layout";
import { usePageTitle } from "../hooks/usePageTitle";

/**
 * BillingCancel Component
 *
 * Displays when a user cancels their Stripe checkout session.
 * Shown at /payment/cancel after Stripe checkout cancellation.
 */
function BillingCancel() {
  // Issue #626: page-owned document.title.
  usePageTitle("Payment Cancelled");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get("cancelled");

  const handleBackToPricing = () => {
    navigate("/pricing");
  };

  const handleTryAgain = () => {
    navigate("/pricing");
  };

  return (
    <Layout headerProps={{ useDefaultTheme: true }}>
      <Container maxWidth="md" sx={{ mt: 8, mb: 8 }}>
        <Paper elevation={3} sx={{ p: 6, textAlign: "center" }}>
          <Box sx={{ mb: 4 }}>
            <Cancel
              sx={{
                fontSize: 80,
                color: "warning.main",
                mb: 2,
              }}
            />
          </Box>

          <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 2 }}>
            Payment Cancelled
          </Typography>

          <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
            Your payment was not completed. No charges have been made to your account.
          </Typography>

          <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: 4 }}>
            If you experienced any issues during checkout, please try again or contact our support
            team for assistance.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", mt: 4 }}>
            <Button variant="outlined" size="large" onClick={handleBackToPricing}>
              Back to Pricing
            </Button>
            <Button variant="contained" size="large" onClick={handleTryAgain}>
              Try Again
            </Button>
          </Box>
        </Paper>
      </Container>
    </Layout>
  );
}

export default BillingCancel;
