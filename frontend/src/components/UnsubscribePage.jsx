import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Container,
  Paper,
  Divider,
} from "@mui/material";
import {
  Unsubscribe as UnsubscribeIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

/**
 * UnsubscribePage Component
 *
 * Handles email unsubscribe flow:
 * 1. Validates token and shows what will be unsubscribed
 * 2. User confirms unsubscribe
 * 3. Shows success with resubscribe option
 *
 * Issue #447: Unsubscribe system implementation
 */
export default function UnsubscribePage() {
  // Issue #626: page-owned document.title.
  usePageTitle("Unsubscribe");

  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyUnsubscribed, setAlreadyUnsubscribed] = useState(false);

  const validateToken = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(`/unsubscribe/${token}`);
      const data = response.data;

      if (data.alreadyUnsubscribed) {
        setAlreadyUnsubscribed(true);
        setTokenData(data);
      } else if (data.valid) {
        setTokenData(data);
      } else {
        setError(data.error || "Invalid unsubscribe link");
      }
    } catch (err) {
      console.error("Token validation error:", err);
      setError(
        err.response?.data?.error || "Unable to validate unsubscribe link. It may have expired."
      );
    } finally {
      setLoading(false);
    }
  };

  // Validate token on mount
  useEffect(() => {
    validateToken();
  }, [token]);

  const handleUnsubscribe = async () => {
    try {
      setProcessing(true);
      setError("");

      await api.post(`/unsubscribe/${token}`);
      setSuccess(true);
    } catch (err) {
      console.error("Unsubscribe error:", err);
      setError(err.response?.data?.error || "Failed to process unsubscribe. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleResubscribe = async () => {
    try {
      setProcessing(true);
      setError("");

      await api.post(`/unsubscribe/${token}/resubscribe`);
      setSuccess(false);
      setAlreadyUnsubscribed(false);
      navigate("/settings/notifications");
    } catch (err) {
      console.error("Resubscribe error:", err);
      setError(err.response?.data?.error || "Failed to resubscribe. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Validating unsubscribe link...</Typography>
      </Container>
    );
  }

  // Error state
  if (error && !tokenData) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <ErrorIcon sx={{ fontSize: 64, color: "error.main", mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Invalid Link
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {error}
          </Typography>
          <Button
            variant="outlined"
            component={Link}
            to="/settings/notifications"
            startIcon={<SettingsIcon />}
          >
            Manage Email Preferences
          </Button>
        </Paper>
      </Container>
    );
  }

  // Already unsubscribed state
  if (alreadyUnsubscribed) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Already Unsubscribed
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            You were previously unsubscribed from {tokenData?.description || "these emails"}.
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
            <Button
              variant="outlined"
              onClick={handleResubscribe}
              disabled={processing}
              startIcon={<RefreshIcon />}
            >
              Resubscribe
            </Button>
            <Button
              variant="contained"
              component={Link}
              to="/settings/notifications"
              startIcon={<SettingsIcon />}
            >
              Manage Preferences
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  // Success state
  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Successfully Unsubscribed
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            You've been unsubscribed from {tokenData?.description || "these emails"}.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            You will no longer receive these notifications.
          </Typography>

          <Divider sx={{ my: 3 }} />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changed your mind?
          </Typography>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
            <Button
              variant="outlined"
              onClick={handleResubscribe}
              disabled={processing}
              startIcon={<RefreshIcon />}
            >
              Resubscribe
            </Button>
            <Button
              variant="contained"
              component={Link}
              to="/settings/notifications"
              startIcon={<SettingsIcon />}
            >
              Manage All Preferences
            </Button>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="caption" color="text.secondary">
            Note: You'll still receive important account emails like password resets and security
            alerts.
          </Typography>
        </Paper>
      </Container>
    );
  }

  // Confirmation state
  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <UnsubscribeIcon sx={{ fontSize: 64, color: "warning.main", mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Unsubscribe Confirmation
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              You're about to unsubscribe from:
            </Typography>
            <Typography variant="h6">{tokenData?.typeName || tokenData?.description}</Typography>

            {tokenData?.ideaTitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Idea: "{tokenData.ideaTitle}"
              </Typography>
            )}

            {tokenData?.email && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Email: {tokenData.email}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          After unsubscribing, you will no longer receive{" "}
          {tokenData?.type === "global" ? "any non-essential emails" : `${tokenData?.description}`}{" "}
          from us.
        </Typography>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
          <Button
            variant="outlined"
            component={Link}
            to="/settings/notifications"
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleUnsubscribe}
            disabled={processing}
            startIcon={processing ? <CircularProgress size={20} /> : null}
          >
            {processing ? "Processing..." : "Confirm Unsubscribe"}
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Want more control?
          </Typography>
          <Button
            variant="text"
            component={Link}
            to="/settings/notifications"
            startIcon={<SettingsIcon />}
            size="small"
          >
            Manage Email Preferences
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
