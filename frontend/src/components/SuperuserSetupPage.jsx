import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import { Container, Paper, Typography, TextField, Button, Box, Grid, Alert } from "@mui/material";
import { SPACING } from "../muiTheme";
import { AdminPanelSettings } from "@mui/icons-material";
import { usePageTitle } from "../hooks/usePageTitle";

/**
 * SuperuserSetupPage Component
 *
 * Allows creation of the first superuser account for a new organisation.
 * Shown at /org/:orgId/setup/superuser during initial organisation setup.
 */
function SuperuserSetupPage() {
  // Issue #626: page-owned document.title.
  usePageTitle("Superuser Setup");

  const navigate = useNavigate();
  const orgId = useOrganizationId();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      setLoading(false);
      return;
    }

    try {
      // Call backend API to create superuser
      const response = await fetch("http://localhost:4000/api/auth/setup-superuser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          username: formData.username,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create superuser account");
      }

      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate(orgPath(orgId, "login"));
      }, 2000);
    } catch (err) {
      console.error("[SuperuserSetupPage] Error:", err);
      setError(err.message || "Failed to create superuser account. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: SPACING.xlarge, mb: SPACING.xlarge }}>
        <Paper elevation={3} sx={{ p: SPACING.large, textAlign: "center" }}>
          <AdminPanelSettings sx={{ fontSize: 80, color: "success.main", mb: SPACING.small }} />
          <Typography variant="h5" gutterBottom>
            Superuser Account Created!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Redirecting to login page...
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: SPACING.xlarge, mb: SPACING.xlarge }}>
      <Paper elevation={3} sx={{ p: SPACING.large }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: SPACING.large }}>
          <AdminPanelSettings sx={{ fontSize: 40, color: "primary.main", mr: 2 }} />
          <Typography variant="h4" component="h1">
            Create Superuser Account
          </Typography>
        </Box>

        <Typography variant="body1" color="text.secondary" paragraph>
          Set up the first administrator account for <strong>{orgId}</strong>.
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
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                autoComplete="username"
                helperText="Your username for logging in"
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
                autoComplete="email"
                helperText="Your email address (optional but recommended)"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                required
                fullWidth
                type="password"
                label="Password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                helperText="At least 8 characters"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                required
                fullWidth
                type="password"
                label="Confirm Password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading}
                sx={{ mt: SPACING.small }}
              >
                {loading ? "Creating Account..." : "Create Superuser Account"}
              </Button>
            </Grid>
          </Grid>
        </form>

        <Box sx={{ mt: SPACING.large }}>
          <Alert severity="info">
            This account will have full administrative privileges. You can create additional users
            later.
          </Alert>
        </Box>
      </Paper>
    </Container>
  );
}

export default SuperuserSetupPage;
