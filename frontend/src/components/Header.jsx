import React, { useContext, useState, useEffect } from "react";
import { ThemeContext, SettingsContext } from "../contexts";
import { useNavigate } from "react-router-dom";
import { orgPath } from "../utils/orgPath";
import { getContrastTextColor } from "../utils/colorUtils";
import { api, API_BASE_URL } from "../api";
import {
  AppBar,
  Toolbar,
  Typography,
  Avatar,
  Divider,
  Box,
  Chip,
  useMediaQuery,
  useTheme,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Article as ReviewIcon,
  Add as SubmitIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  BarChart as AnalyticsIcon,
  Notifications as NotificationsIcon,
} from "@mui/icons-material";

export default function Header({
  children,
  admin,
  user,
  useDefaultTheme = false,
  orgSettings = null,
}) {
  const theme = useContext(ThemeContext);
  const {
    primaryColor,
    logoUrl: contextLogoUrl,
    logoHighContrast: contextLogoHighContrast,
  } = useContext(SettingsContext);
  const muiTheme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md")); // Mobile menu at 900px
  const isCompactTitle = useMediaQuery(muiTheme.breakpoints.down("lg"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    // Don't load settings if we want to use default theme or if orgSettings are provided
    if (useDefaultTheme || orgSettings) return;

    const loadSettings = async () => {
      try {
        // Get organisation ID from localStorage to load org-specific settings
        const orgId = localStorage.getItem("organizationId");
        if (orgId) {
          const token = localStorage.getItem("token");
          if (!token) {
            const response = await api.get(`/settings/organization/${orgId}/public`, {
              skipOrganizationId: true,
            });
            setSettings(response.data);
          } else {
            try {
              // Try authenticated endpoint first (for admin settings)
              const response = await api.get(`/settings/organization/${orgId}`);
              setSettings(response.data);
            } catch (err) {
              // Fall back to public endpoint if access is denied
              if (err.response?.status === 401 || err.response?.status === 403) {
                const response = await api.get(`/settings/organization/${orgId}/public`, {
                  skipOrganizationId: true,
                });
                setSettings(response.data);
              } else {
                throw err;
              }
            }
          }
        }
        // Issue #546: when no orgId is resolved, skip the fetch; header
        // falls back to default theme/logo values until an org is selected.
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, [useDefaultTheme, orgSettings]);

  // Use orgSettings if provided, otherwise use loaded settings, or use context values
  const activeSettings = orgSettings || settings;
  // Prioritize context primaryColor (from SettingsContext) over activeSettings to ensure live updates
  const effectiveColor = useDefaultTheme
    ? "#ffffff"
    : primaryColor || activeSettings.primaryColor || "#1565c0";
  // Prioritize contextLogoUrl (from SettingsContext) over activeSettings to ensure live updates
  const effectiveLogoUrl = contextLogoUrl || activeSettings.logoUrl;
  // Prioritize contextLogoHighContrast (from SettingsContext) over activeSettings to ensure live updates without page reload
  const logoHighContrast =
    contextLogoHighContrast !== undefined
      ? contextLogoHighContrast
      : activeSettings.logoHighContrast === true || activeSettings.logoHighContrast === "true";

  // Mirrors the <img src> resolution below: true when the rendered logo is
  // /br360_logo.webp (the v7 default, which already carries the wordmark).
  // brandText next to the wordmark would be visually duplicated, so it is
  // only rendered when a custom tenant logo (mark-only) is in use.
  const usingDefaultLogo =
    useDefaultTheme ||
    !effectiveLogoUrl ||
    (!effectiveLogoUrl.startsWith("http") && !(API_BASE_URL && API_BASE_URL.startsWith("http")));

  const backgroundColor = effectiveColor;
  const textColor = useDefaultTheme
    ? "#1a202c"
    : effectiveColor
      ? getContrastTextColor(effectiveColor)
      : "#1a202c";

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleMobileNavigation = (action) => {
    setMobileMenuOpen(false);
    const orgId = localStorage.getItem("organizationId");
    if (action === "submit") {
      navigate(orgId ? orgPath(orgId, "submit") : "/submit");
    } else if (action === "review") {
      navigate(orgId ? orgPath(orgId, "review") : "/review");
    } else if (action === "settings") {
      navigate(orgId ? orgPath(orgId, "admin") : "/admin");
    } else if (action === "analytics") {
      navigate(orgId ? orgPath(orgId, "analytics") : "/analytics");
    } else if (action === "notifications") {
      navigate(orgId ? orgPath(orgId, "notifications") : "/notifications");
    } else if (action === "logout") {
      localStorage.removeItem("token");
      navigate(orgId ? orgPath(orgId, "") : "/");
    }
  };
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: backgroundColor,
        color: textColor,
        borderBottom: `1px solid ${textColor}20`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "none !important", // Disable all transitions
        backfaceVisibility: "hidden", // Force GPU rendering
        transform: "translateZ(0)", // Force GPU acceleration
        WebkitFontSmoothing: "antialiased", // Prevent font flickering
      }}
    >
      <Toolbar sx={{ justifyContent: "space-between", px: 2, borderRadius: 2 }}>
        {/* Logo and Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {usingDefaultLogo ? (
            <Typography
              component="span"
              onClick={() => {
                const orgId = localStorage.getItem("organizationId");
                navigate(orgId ? orgPath(orgId, "") : "/");
              }}
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1rem", sm: "1.15rem" },
                letterSpacing: "-0.025em",
                color: textColor,
                cursor: "pointer",
                userSelect: "none",
                lineHeight: 1,
              }}
            >
              Business Review{" "}
              <Box
                component="span"
                sx={{ color: textColor === "#FFFFFF" ? "inherit" : "primary.main" }}
              >
                360
              </Box>
            </Typography>
          ) : (
            <>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: logoHighContrast ? "rgb(255, 255, 255)" : "transparent",
                  borderRadius: logoHighContrast ? 1 : 0,
                  padding: logoHighContrast ? "4px 8px" : 0,
                  boxShadow: logoHighContrast ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onClick={() => {
                  const orgId = localStorage.getItem("organizationId");
                  navigate(orgId ? orgPath(orgId, "") : "/");
                }}
              >
                <Box
                  component="img"
                  src={
                    effectiveLogoUrl.startsWith("http")
                      ? effectiveLogoUrl
                      : API_BASE_URL && API_BASE_URL.startsWith("http")
                        ? `${API_BASE_URL}${effectiveLogoUrl}`
                        : "/br360_logo.webp"
                  }
                  alt="Business Review 360 Logo"
                  sx={{
                    height: { xs: 32, sm: 40 },
                    maxWidth: { xs: 140, sm: 200 },
                    width: "auto",
                    objectFit: "contain",
                    display: "block",
                    filter: "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.15))",
                  }}
                  onError={(e) => {
                    if (e.target.src !== window.location.origin + "/br360_logo.webp") {
                      e.target.src = "/br360_logo.webp";
                    }
                  }}
                />
              </Box>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: textColor,
                  letterSpacing: "-0.025em",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const orgId = localStorage.getItem("organizationId");
                  navigate(orgId ? orgPath(orgId, "review") : "/review");
                }}
              >
                Business Review 360
              </Typography>
            </>
          )}
        </Box>

        {/* Navigation and User */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Mobile menu button - only for logged-in users */}
          {isMobile && user && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="menu"
              onClick={handleMobileMenuToggle}
              data-testid="mobile-menu-button"
              sx={{ color: textColor }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Desktop navigation */}
          <Box
            component="nav"
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              gap: 1,
              "& .MuiButton-root": {
                color: textColor,
                backgroundColor:
                  textColor === "#FFFFFF" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                "&:hover": {
                  backgroundColor:
                    textColor === "#FFFFFF" ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.12)",
                },
              },
            }}
            aria-label="Main navigation"
          >
            {children}
          </Box>
          {user && (
            <>
              <Divider
                orientation="vertical"
                sx={{
                  height: 32,
                  alignSelf: "center",
                  backgroundColor: textColor,
                  opacity: 0.3,
                }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Avatar
                  src={user.avatar}
                  alt={user.username}
                  sx={{
                    width: { xs: 24, sm: 32, md: 40 },
                    height: { xs: 24, sm: 32, md: 40 },
                    fontSize: "0.875rem",
                    bgcolor: "white",
                    color: effectiveColor,
                    border: `2px solid ${effectiveColor}`,
                    fontWeight: 700,
                  }}
                >
                  {user.username?.charAt(0)?.toUpperCase() || "U"}
                </Avatar>
                <Typography
                  variant="body2"
                  sx={{
                    display: { xs: "none", md: "block" },
                    fontWeight: 500,
                    color: textColor,
                    opacity: 0.8,
                  }}
                >
                  {user.username}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </Toolbar>

      {/* Mobile menu drawer */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={handleMobileMenuToggle}
        data-testid="mobile-menu"
        sx={{
          "& .MuiDrawer-paper": {
            width: 250,
            boxSizing: "border-box",
            maxHeight: "100vh",
            overflowY: "auto",
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <Typography variant="h6" sx={{ mb: 2, flexShrink: 0 }}>
            Navigation
          </Typography>
          <List sx={{ flex: 1, overflowY: "auto" }}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleMobileNavigation("review")}
                data-testid="mobile-nav-review"
              >
                <ListItemIcon>
                  <ReviewIcon />
                </ListItemIcon>
                <ListItemText primary="Review Ideas" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleMobileNavigation("submit")}
                data-testid="mobile-nav-submit"
              >
                <ListItemIcon>
                  <SubmitIcon />
                </ListItemIcon>
                <ListItemText primary="Submit Idea" />
              </ListItemButton>
            </ListItem>
            {admin && (
              <>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleMobileNavigation("settings")}
                    data-testid="mobile-nav-settings"
                  >
                    <ListItemIcon>
                      <SettingsIcon />
                    </ListItemIcon>
                    <ListItemText primary="Settings" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleMobileNavigation("analytics")}
                    data-testid="mobile-nav-analytics"
                  >
                    <ListItemIcon>
                      <AnalyticsIcon />
                    </ListItemIcon>
                    <ListItemText primary="Analytics" />
                  </ListItemButton>
                </ListItem>
              </>
            )}
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleMobileNavigation("notifications")}
                data-testid="mobile-nav-notifications"
              >
                <ListItemIcon>
                  <NotificationsIcon />
                </ListItemIcon>
                <ListItemText primary="Notifications" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleMobileNavigation("logout")}
                data-testid="mobile-nav-logout"
              >
                <ListItemIcon>
                  <LogoutIcon />
                </ListItemIcon>
                <ListItemText primary="Logout" />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}
