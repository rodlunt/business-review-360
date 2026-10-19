import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import { useResponsive } from "../hooks/useResponsive";
import { usePageTitle } from "../hooks/usePageTitle";
import { ThemeContext } from "../contexts";
import { useAuth } from "../auth";
import Layout from "./Layout";
import IdeaView from "./IdeaView";
import { Button } from "./ui/button";
import { api } from "../api";
import { Box, Menu, MenuItem } from "@mui/material";
import { ArrowDropDown } from "@mui/icons-material";

export default function IdeaPage() {
  const { slug } = useParams();
  const organizationId = useOrganizationId();
  const navigate = useNavigate();
  const [idea, setIdea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isMobile } = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout, loading: authLoading } = useAuth();
  const theme = useContext(ThemeContext);

  // Issue #626: idea title in the browser tab once the data loads.
  usePageTitle(idea?.title || "Idea");

  const [adminMenuAnchor, setAdminMenuAnchor] = useState(null);
  const adminMenuOpen = Boolean(adminMenuAnchor);

  const handleAdminMenuClick = (event) => {
    setAdminMenuAnchor(event.currentTarget);
  };

  const handleAdminMenuClose = () => {
    setAdminMenuAnchor(null);
  };

  const handleAdminSettings = () => {
    const storedOrgId = organizationId || localStorage.getItem("organizationId");
    navigate(orgPath(storedOrgId, "admin"));
    handleAdminMenuClose();
  };

  const handleAnalytics = () => {
    const storedOrgId = organizationId || localStorage.getItem("organizationId");
    navigate(orgPath(storedOrgId, "analytics"));
    handleAdminMenuClose();
  };

  const handleLogout = () => {
    logout();
    const storedOrgId = organizationId || localStorage.getItem("organizationId");
    if (storedOrgId) {
      navigate(orgPath(storedOrgId, ""));
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchIdea = async () => {
      try {
        console.log("Fetching idea with slug:", slug);
        const response = await api.get(`/ideas/${slug}`);
        console.log("Fetched idea data:", response.data);
        setIdea(response.data);
      } catch (err) {
        if (err.response?.status === 404) {
          setError("Idea not found");
        } else {
          setError("Failed to load idea");
        }
        console.error("Error fetching idea:", err);
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchIdea();
    }
  }, [slug, authLoading, user]);

  if (authLoading || loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    const storedOrgId = organizationId || localStorage.getItem("organizationId");
    if (storedOrgId) {
      navigate(orgPath(storedOrgId, "login"), { replace: true });
    } else {
      navigate("/", { replace: true });
    }
    return null;
  }

  if (error) return <div style={{ p: 4, color: "red" }}>Error: {error}</div>;
  if (!idea) return <div style={{ p: 4 }}>Idea not found</div>;

  const renderHeaderChildren = () => {
    if (isMobile) {
      return (
        <button
          style={{
            background: "none",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748b",
            transition: "all 0.2s ease",
          }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = "#f8fafc";
            e.target.style.borderColor = "#cbd5e1";
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = "transparent";
            e.target.style.borderColor = "#e2e8f0";
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      );
    }

    return (
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Button
          variant="greyscale"
          onClick={() => navigate(orgPath(organizationId, "review"))}
          size="small"
          data-testid="review-ideas-button"
          sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
        >
          Review Ideas
        </Button>
        <Button
          variant="greyscale"
          onClick={() => navigate(orgPath(organizationId, "submit"))}
          size="small"
          data-testid="submit-idea-button"
          sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
        >
          Submit Idea
        </Button>
        {user.isAdmin && (
          <>
            <Button
              variant="greyscale"
              onClick={handleAdminMenuClick}
              size="small"
              data-testid="admin-menu-button"
              sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
              endIcon={<ArrowDropDown />}
            >
              Admin
            </Button>
            <Menu
              anchorEl={adminMenuAnchor}
              open={adminMenuOpen}
              onClose={handleAdminMenuClose}
              MenuListProps={{ "aria-labelledby": "admin-menu-button" }}
              PaperProps={{ sx: { minWidth: "120px" } }}
            >
              <MenuItem onClick={handleAdminSettings} data-testid="admin-settings-menu-item">
                Settings
              </MenuItem>
              <MenuItem onClick={handleAnalytics} data-testid="admin-analytics-menu-item">
                Analytics
              </MenuItem>
            </Menu>
          </>
        )}
        <Button
          variant="greyscale"
          onClick={handleLogout}
          size="small"
          data-testid="logout-button"
          sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
        >
          Logout
        </Button>
      </div>
    );
  };

  const renderMobileMenu = () => {
    if (!isMobile || !mobileMenuOpen) return null;

    return (
      <Box
        sx={{
          position: "fixed",
          top: { xs: "56px", sm: "64px" },
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1200,
          bgcolor: "rgba(0,0,0,0.4)",
        }}
        onClick={() => setMobileMenuOpen(false)}
      >
        <Box
          sx={{
            bgcolor: "background.paper",
            boxShadow: 4,
            py: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: "Review", path: "review" },
            { label: "Submit", path: "submit" },
          ].map(({ label, path }) => (
            <Button
              key={label}
              variant="text"
              sx={{ width: 200 }}
              onClick={() => {
                navigate(orgPath(organizationId, path));
                setMobileMenuOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
          {user.isAdmin && (
            <>
              <Button
                variant="text"
                sx={{ width: 200 }}
                onClick={() => {
                  navigate(orgPath(organizationId, "admin"));
                  setMobileMenuOpen(false);
                }}
              >
                Admin Settings
              </Button>
              <Button
                variant="text"
                sx={{ width: 200 }}
                onClick={() => {
                  navigate(orgPath(organizationId, "analytics"));
                  setMobileMenuOpen(false);
                }}
              >
                Analytics
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            sx={{ width: 200 }}
            onClick={() => {
              handleLogout();
              setMobileMenuOpen(false);
            }}
          >
            Logout
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Layout
      headerProps={{ isMobile, user, admin: user?.isAdmin }}
      headerChildren={renderHeaderChildren()}
      mobileMenu={renderMobileMenu()}
      containerStyle={{
        background: theme.backgroundColor,
        color: theme.textColor,
      }}
    >
      <div style={{ paddingTop: "24px", paddingBottom: "96px" }}>
        <IdeaView idea={idea} showBackButton={true} organizationId={organizationId} />
      </div>
    </Layout>
  );
}
