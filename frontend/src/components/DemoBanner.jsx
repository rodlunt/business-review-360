import React, { useState } from "react";
import { Box, Typography, Button, Chip, CircularProgress } from "@mui/material";
import { PlayCircleOutlined, AdminPanelSettings, Person } from "@mui/icons-material";
import { api, setAuthToken } from "../api";

/**
 * DemoBanner (#566)
 *
 * Persistent banner shown when req.user.isDemo is true. Surfaces the
 * current demo role, provides a one-click role switcher, and links to
 * the trial signup with the visitor's email pre-filled.
 */
function DemoBanner({ user, onUserUpdate }) {
  const [switching, setSwitching] = useState(false);

  const isAdmin = user?.isAdmin;
  const targetRole = isAdmin ? "user" : "admin";
  const targetLabel = isAdmin ? "Switch to User view" : "Switch to Admin view";
  const TargetIcon = isAdmin ? Person : AdminPanelSettings;

  const trialUrl = "https://demo-corp.br360.example.com/register";

  const handleSwitchRole = async () => {
    setSwitching(true);
    try {
      const res = await api.post("/billing/demo-switch-role", { demoRole: targetRole });
      const { token, user: updatedUser } = res.data;
      setAuthToken(token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      if (onUserUpdate) onUserUpdate(updatedUser);
    } catch {
      // Role switch failure is non-fatal; the current session continues.
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
        px: 3,
        py: 1,
        bgcolor: "primary.main",
        color: "primary.contrastText",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <PlayCircleOutlined fontSize="small" />
        <Typography variant="body2" fontWeight={600}>
          Demo mode
        </Typography>
        <Chip
          label={isAdmin ? "Admin view" : "User view"}
          size="small"
          sx={{
            bgcolor: "rgba(255,255,255,0.2)",
            color: "inherit",
            fontWeight: 600,
            fontSize: "0.7rem",
          }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            switching ? (
              <CircularProgress size={12} color="inherit" />
            ) : (
              <TargetIcon fontSize="small" />
            )
          }
          onClick={handleSwitchRole}
          disabled={switching}
          sx={{
            color: "inherit",
            borderColor: "rgba(255,255,255,0.5)",
            "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" },
            textTransform: "none",
            fontSize: "0.75rem",
          }}
        >
          {targetLabel}
        </Button>

        <Button
          size="small"
          variant="contained"
          href={trialUrl}
          sx={{
            bgcolor: "white",
            color: "primary.main",
            fontWeight: 700,
            "&:hover": { bgcolor: "grey.100" },
            textTransform: "none",
            fontSize: "0.75rem",
          }}
        >
          See it in action
        </Button>
      </Box>
    </Box>
  );
}

export default DemoBanner;
