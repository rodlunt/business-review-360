import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Container,
  CircularProgress,
  Alert,
} from "@mui/material";
import { api, API_BASE_URL } from "../api";
import { SettingsContext } from "../contexts";
import { usePageTitle } from "../hooks/usePageTitle";
import Header from "./Header";
import Footer from "./Footer";

function OrganizationLanding() {
  const organizationId = useOrganizationId();
  const navigate = useNavigate();
  const { setPrimaryColor } = useContext(SettingsContext);
  const [orgSettings, setOrgSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrganizationSettings = async () => {
      try {
        console.log("Fetching organisation settings for:", organizationId);
        const response = await api.get(`/settings/organization/${organizationId}/public`, {
          skipOrganizationId: true,
        });
        console.log("Organisation settings loaded:", response.data);
        console.log("Primary colour from API:", response.data.primaryColor);
        setOrgSettings(response.data);

        // Update global theme colour
        if (response.data.primaryColor) {
          console.log("Setting theme primary colour to:", response.data.primaryColor);
          setPrimaryColor(response.data.primaryColor);
          // Store organizationId in localStorage
          localStorage.setItem("organizationId", organizationId);
        } else {
          console.log("No primaryColor in response, will use fallback");
          localStorage.setItem("organizationId", organizationId);
        }
      } catch (err) {
        console.error("Error fetching organisation settings:", err);
        console.error("Error details:", {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          url: err.config?.url,
          baseURL: err.config?.baseURL,
        });
        if (err.response?.status === 404) {
          setError("Organisation not found");
        } else {
          setError(`Failed to load organisation information: ${err.message || "Unknown error"}`);
        }
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchOrganizationSettings();
    } else {
      setError("No organisation ID provided");
      setLoading(false);
    }
  }, [organizationId, setPrimaryColor]);

  // Issue #626: page-owned document.title via the shared usePageTitle hook.
  // Falls back to a generic label while organisation settings are still loading.
  usePageTitle(orgSettings?.organizationName || "Organisation");

  const resolveLogoSrc = (logoUrl) => {
    if (logoUrl && logoUrl !== "") {
      if (logoUrl.startsWith("http")) {
        console.log("[OrganizationLanding] Using external logo URL:", logoUrl);
        return logoUrl;
      }
      const fullUrl = `${API_BASE_URL}${logoUrl}`;
      console.log("[OrganizationLanding] Using backend logo URL:", fullUrl);
      return fullUrl;
    }
    // Default to BR360 webp logo with transparency
    console.log("[OrganizationLanding] Using default BR360 logo: /br360_logo.webp");
    return "/br360_logo.webp";
  };

  const getThemeStyles = () => {
    if (!orgSettings) return {};

    return {
      backgroundColor: orgSettings.backgroundColor || "#f5f5f5",
      color: orgSettings.textColor || "#333333",
      minHeight: "100vh",
    };
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#f5f5f5",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#f5f5f5",
        }}
      >
        <Container maxWidth="sm">
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Button variant="contained" onClick={() => navigate("/")} fullWidth>
            Go to Main Application
          </Button>
        </Container>
      </Box>
    );
  }

  return (
    <>
      <Header />
      <Box
        sx={{
          ...getThemeStyles(),
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          height: "calc(100vh - 120px)",
          overflowY: "auto",
          pt: { xs: "4vh", sm: "15vh" },
          pb: { xs: 10, sm: 4 },
        }}
      >
        <Container maxWidth="sm">
          <Card
            sx={{
              textAlign: "center",
              backgroundColor: "background.paper",
              borderRadius: 4,
              border: `2px solid ${orgSettings.primaryColor || "#1565c0"}`,
              boxShadow: `0 4px 24px ${orgSettings.primaryColor ? orgSettings.primaryColor + "28" : "rgba(21,101,192,0.16)"}, 0 1px 4px rgba(0,0,0,0.06)`,
            }}
          >
            <CardContent sx={{ p: 4 }}>
              {/* Organisation Logo */}
              <Box
                sx={{
                  mb: 2,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  minHeight: "80px",
                }}
              >
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    ...(orgSettings.logoHighContrast && {
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: 1,
                      padding: "6px 10px",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    }),
                  }}
                >
                  <Box
                    component="img"
                    src={resolveLogoSrc(orgSettings.logoUrl)}
                    alt={`${orgSettings.organizationName || "Organisation"} Logo`}
                    sx={{
                      maxHeight: "80px",
                      maxWidth: { xs: "240px", sm: "300px" },
                      width: "auto",
                      height: "auto",
                      objectFit: "contain",
                      display: "block",
                    }}
                    onError={(e) => {
                      console.error("Logo failed to load");
                      if (e.target.src !== window.location.origin + "/br360_logo.webp") {
                        e.target.src = "/br360_logo.webp";
                      }
                    }}
                  />
                </Box>
              </Box>

              {/* Organisation Title */}
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  textAlign: "center",
                  fontWeight: 700,
                  mb: 2,
                  color: "text.primary",
                }}
              >
                {orgSettings.organizationDescription ||
                  `Business Review 360 for ${orgSettings.organizationName}`}
              </Typography>

              {/* Welcome Message */}
              <Typography
                variant="body1"
                sx={{
                  textAlign: "center",
                  mb: 4,
                  color: "text.secondary",
                  fontSize: "0.95rem",
                }}
              >
                Welcome to our idea management platform. Share your innovative ideas, collaborate
                with your team, and help drive positive change in our organisation.
              </Typography>

              {/* Continue Button */}
              <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Button
                  type="button"
                  variant="contained"
                  size="large"
                  onClick={() => navigate(orgPath(organizationId, "login"))}
                  fullWidth
                  sx={{
                    textTransform: "uppercase",
                    fontWeight: 600,
                    py: 1.5,
                    backgroundColor: orgSettings.primaryColor || "#1565c0",
                    color: "#ffffff",
                    "&:hover": {
                      backgroundColor: orgSettings.primaryColor
                        ? `${orgSettings.primaryColor}dd`
                        : "#0d47a1",
                    },
                  }}
                  data-testid="enter-application"
                >
                  Continue
                </Button>
              </Box>

              {/* Organisation ID Display (for admin reference) */}
              {orgSettings.organizationId && (
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: "center",
                    color: "text.disabled",
                    mt: 3,
                    fontSize: "0.875rem",
                  }}
                >
                  Organisation ID: {orgSettings.organizationId}
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Box sx={{ mt: 4, textAlign: "center" }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              Powered by Business Review 360 - Enterprise Idea Management Platform
            </Typography>
          </Box>
        </Container>
      </Box>
      <Footer />
    </>
  );
}

export default OrganizationLanding;
