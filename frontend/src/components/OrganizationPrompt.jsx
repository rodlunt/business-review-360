import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Container,
  Alert,
  Divider,
} from "@mui/material";
import { SettingsContext } from "../contexts";
import Header from "./Header";
import Footer from "./Footer";
import { validateOrgId, sanitizeOrgId } from "../utils/orgIdValidation";
import { usePageTitle } from "../hooks/usePageTitle";

function OrganizationPrompt() {
  // Issue #626: page-owned document.title.
  usePageTitle("Choose Organisation");

  const navigate = useNavigate();
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const { primaryColor, setPrimaryColor } = useContext(SettingsContext);
  const inputRef = useRef(null);

  // Focus the org ID input once on mount; do NOT use autoFocus prop because
  // the setPrimaryColor(null) call below causes a SettingsContext update which
  // re-renders this component, and MUI's autoFocus on re-render drops the cursor.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset theme to default when this page loads.
  // Guard against calling setPrimaryColor when it's already null to avoid a
  // needless context re-render that would blur the org ID input.
  useEffect(() => {
    if (primaryColor !== null) setPrimaryColor(null);
    localStorage.removeItem("primaryColor");
    localStorage.removeItem("organizationId");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOrgIdChange = (e) => {
    const value = e.target.value;
    setOrgId(value);
    setError("");
    setFieldError("");

    // Real-time validation (only show errors after user starts typing)
    if (value.trim().length > 0) {
      const validation = validateOrgId(value);
      if (!validation.valid) {
        setFieldError(validation.error);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setFieldError("");

    if (!orgId.trim()) {
      setFieldError("Please enter an organisation ID");
      return;
    }

    // Validate orgId format
    const validation = validateOrgId(orgId);
    if (!validation.valid) {
      setFieldError(validation.error);
      return;
    }

    // Navigate to the organisation landing page with sanitised orgId
    navigate(`/org/${validation.sanitized}`);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        m: 0,
        p: 0,
      }}
    >
      <Header useDefaultTheme={true} />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          flex: 1,
          backgroundColor: "#f5f5f5",
          overflowY: "auto",
          pt: { xs: "4vh", sm: "15vh" },
          pb: { xs: 10, sm: 4 },
          px: 0,
          width: "100%",
          m: 0,
        }}
      >
        <Container maxWidth="sm">
          <Card
            elevation={0}
            sx={{
              borderRadius: 4,
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Typography
                component="a"
                href="/"
                sx={{
                  display: "block",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "1.5rem",
                  letterSpacing: "-0.025em",
                  mb: 1,
                  color: "text.primary",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "none" },
                }}
              >
                Business Review{" "}
                <Box component="span" sx={{ color: "#1565c0" }}>
                  360
                </Box>
              </Typography>

              <Divider sx={{ mb: 3 }} />

              <Typography
                variant="h5"
                component="h1"
                sx={{
                  textAlign: "center",
                  fontWeight: 700,
                  mb: 2,
                  color: "text.primary",
                }}
              >
                Welcome
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  textAlign: "center",
                  mb: 4,
                  color: "text.secondary",
                  fontSize: "0.95rem",
                }}
              >
                Enter your organisation ID to access your idea management platform
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}

              <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{ display: "flex", flexDirection: "column", gap: 3 }}
              >
                <TextField
                  label="Organisation ID"
                  value={orgId}
                  onChange={handleOrgIdChange}
                  fullWidth
                  placeholder="e.g., acme-corp"
                  slotProps={{ htmlInput: { ref: inputRef } }}
                  error={!!fieldError}
                  helperText={
                    fieldError || "Only lowercase letters, numbers, and hyphens (3-30 characters)"
                  }
                />

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{
                    textTransform: "uppercase",
                    fontWeight: 600,
                    py: 1.5,
                  }}
                >
                  Continue
                </Button>
              </Box>

              <Typography
                variant="body2"
                sx={{
                  textAlign: "center",
                  color: "text.secondary",
                  mt: 3,
                  fontSize: "0.875rem",
                }}
              >
                Don't have an organisation ID? Contact your administrator.
              </Typography>
            </CardContent>
          </Card>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}

export default OrganizationPrompt;
