import React, { useState } from "react";
import { useNavigate, useLocation, matchPath } from "react-router-dom";
import { orgPath } from "../utils/orgPath";
import { Button } from "./ui/button";
import { Box, Menu, MenuItem } from "@mui/material";
import { ArrowDropDown } from "@mui/icons-material";

export function AppNavHeader({
  user,
  organizationId,
  isMobile,
  onToggleMobileMenu,
  onLogout,
  orgName,
  primaryColor,
  memberships,
  onSwitchOrg,
  onResumeTour,
}) {
  const navigate = useNavigate();
  const [adminMenuAnchor, setAdminMenuAnchor] = useState(null);
  const [orgMenuAnchor, setOrgMenuAnchor] = useState(null);
  const adminMenuOpen = Boolean(adminMenuAnchor);
  const orgMenuOpen = Boolean(orgMenuAnchor);
  const otherOrgs = (memberships || []).filter((m) => m.organizationId !== organizationId);

  if (isMobile) {
    return (
      <button
        style={{
          background: "none",
          border: "1px solid currentColor",
          opacity: 0.7,
          borderRadius: "6px",
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "inherit",
          transition: "opacity 0.2s ease",
        }}
        onClick={onToggleMobileMenu}
        aria-label="Toggle navigation menu"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.7";
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
        variant="contained"
        onClick={() => navigate(orgPath(organizationId, "review"))}
        size="small"
        data-testid="review-ideas-button"
        sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
      >
        Review Ideas
      </Button>
      <Button
        variant="outlined"
        onClick={() => navigate(orgPath(organizationId, "submit"))}
        size="small"
        data-testid="submit-idea-button"
        sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
      >
        Submit Idea
      </Button>
      <Button
        variant="outlined"
        onClick={() => navigate(orgPath(organizationId, "notifications"))}
        size="small"
        data-testid="notifications-button"
        sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
      >
        Notifications
      </Button>
      {user?.isAdmin && (
        <>
          <Button
            variant="outlined"
            onClick={(e) => setAdminMenuAnchor(e.currentTarget)}
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
            onClose={() => setAdminMenuAnchor(null)}
            MenuListProps={{ "aria-labelledby": "admin-menu-button" }}
            PaperProps={{ sx: { minWidth: "120px" } }}
          >
            <MenuItem
              onClick={() => {
                navigate(orgPath(organizationId, "admin"));
                setAdminMenuAnchor(null);
              }}
              data-testid="admin-settings-menu-item"
            >
              Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                navigate(orgPath(organizationId, "analytics"));
                setAdminMenuAnchor(null);
              }}
              data-testid="admin-analytics-menu-item"
            >
              Analytics
            </MenuItem>
            {onResumeTour && (
              <MenuItem
                onClick={() => {
                  onResumeTour();
                  setAdminMenuAnchor(null);
                }}
                data-testid="resume-tour-menu-item"
              >
                Guided tour
              </MenuItem>
            )}
          </Menu>
        </>
      )}
      {otherOrgs.length > 0 && (
        <>
          <Button
            variant="outlined"
            onClick={(e) => setOrgMenuAnchor(e.currentTarget)}
            size="small"
            data-testid="org-switch-button"
            sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
            endIcon={<ArrowDropDown />}
          >
            Switch Org
          </Button>
          <Menu
            anchorEl={orgMenuAnchor}
            open={orgMenuOpen}
            onClose={() => setOrgMenuAnchor(null)}
            PaperProps={{ sx: { minWidth: "160px" } }}
          >
            {otherOrgs.map((m) => (
              <MenuItem
                key={m.organizationId}
                onClick={() => {
                  setOrgMenuAnchor(null);
                  onSwitchOrg(m.organizationId);
                }}
              >
                {m.orgName || m.organizationId}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
      <Button
        variant="outlined"
        onClick={onLogout}
        size="small"
        data-testid="logout-button"
        sx={{ minWidth: "120px", whiteSpace: "nowrap" }}
      >
        Logout
      </Button>
    </div>
  );
}

export function AppMobileMenu({
  isOpen,
  isMobile,
  onClose,
  user,
  organizationId,
  onLogout,
  orgName,
  primaryColor,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isOpen || !isMobile) return null;

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
      onClick={onClose}
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
          { label: "Review", path: "review", patterns: ["/org/:organizationId/review", "/review"] },
          { label: "Submit", path: "submit", patterns: ["/org/:organizationId/submit", "/submit"] },
          {
            label: "Notifications",
            path: "notifications",
            patterns: ["/org/:organizationId/notifications", "/notifications"],
          },
        ].map(({ label, path, patterns }) => {
          const isActive = patterns.some((p) => matchPath(p, location.pathname));
          return (
            <Button
              key={label}
              variant="text"
              sx={{ width: 200, bgcolor: isActive ? "action.selected" : undefined }}
              onClick={() => {
                navigate(orgPath(organizationId, path));
                onClose();
              }}
            >
              {label}
            </Button>
          );
        })}
        {user?.isAdmin && (
          <>
            <Button
              variant="text"
              sx={{ width: 200 }}
              onClick={() => {
                navigate(orgPath(organizationId, "admin"));
                onClose();
              }}
            >
              Admin Settings
            </Button>
            <Button
              variant="text"
              sx={{ width: 200 }}
              onClick={() => {
                navigate(orgPath(organizationId, "analytics"));
                onClose();
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
            onLogout();
            onClose();
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
}
