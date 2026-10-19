import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Switch,
  Typography,
  Box,
  Alert,
  Divider,
  CircularProgress,
} from "@mui/material";
import { api } from "../api";
import { SPACING } from "../muiTheme";
import { useSnackbar } from "./GlobalSnackbar";

export default function OAuthSettingsModal({ open, onClose, currentSettings, onSettingsUpdate }) {
  const [settings, setSettings] = useState({
    oauthGoogleEnabled: false,
    oauthGithubEnabled: false,
    oauthMicrosoftEnabled: false,
    oauthAutoSuperuser: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    if (open && currentSettings) {
      setSettings({
        oauthGoogleEnabled:
          currentSettings.oauthGoogleEnabled === true ||
          currentSettings.oauthGoogleEnabled === "true",
        oauthGithubEnabled:
          currentSettings.oauthGithubEnabled === true ||
          currentSettings.oauthGithubEnabled === "true",
        oauthMicrosoftEnabled:
          currentSettings.oauthMicrosoftEnabled === true ||
          currentSettings.oauthMicrosoftEnabled === "true",
        oauthAutoSuperuser:
          currentSettings.oauthAutoSuperuser === true ||
          currentSettings.oauthAutoSuperuser === "true",
      });
      setHasChanges(false);
      setError("");
    }
  }, [open, currentSettings]);

  const handleChange = (field) => (event) => {
    setSettings((prev) => ({ ...prev, [field]: event.target.checked }));
    setHasChanges(true);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/settings", settings);
      if (onSettingsUpdate) {
        await onSettingsUpdate();
      }
      showSnackbar("Sign-in provider settings saved", "success");
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to save settings. Please try again.";
      setError(msg);
      showSnackbar(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setHasChanges(false);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          Sign-in Providers
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: SPACING.micro }}>
          Enable social sign-in options shown on the login page for this organisation
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: SPACING.large }}>
          {/* Google */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.oauthGoogleEnabled}
                  onChange={handleChange("oauthGoogleEnabled")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Google
                </Typography>
              }
              sx={{ mb: SPACING.micro }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: SPACING.xlarge }}>
              {settings.oauthGoogleEnabled
                ? "Users can sign in with their Google account"
                : "Google sign-in is disabled for this organisation"}
            </Typography>
          </Box>

          <Divider />

          {/* GitHub */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.oauthGithubEnabled}
                  onChange={handleChange("oauthGithubEnabled")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  GitHub
                </Typography>
              }
              sx={{ mb: SPACING.micro }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: SPACING.xlarge }}>
              {settings.oauthGithubEnabled
                ? "Users can sign in with their GitHub account"
                : "GitHub sign-in is disabled for this organisation"}
            </Typography>
          </Box>

          <Divider />

          {/* Microsoft */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.oauthMicrosoftEnabled}
                  onChange={handleChange("oauthMicrosoftEnabled")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Microsoft
                </Typography>
              }
              sx={{ mb: SPACING.micro }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: SPACING.xlarge }}>
              {settings.oauthMicrosoftEnabled
                ? "Users can sign in with their Microsoft account"
                : "Microsoft sign-in is disabled for this organisation"}
            </Typography>
          </Box>

          <Divider />

          {/* Auto-superuser */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.oauthAutoSuperuser}
                  onChange={handleChange("oauthAutoSuperuser")}
                  disabled={saving}
                  color="warning"
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Auto-grant superuser on sign-in
                </Typography>
              }
              sx={{ mb: SPACING.micro }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: SPACING.xlarge }}>
              {settings.oauthAutoSuperuser
                ? "New OAuth sign-ups are automatically granted superuser access. Enable only for demo orgs."
                : "New OAuth sign-ups receive standard user access"}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: SPACING.medium }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: SPACING.large, py: SPACING.medium }}>
        <Button onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !hasChanges}
          startIcon={saving && <CircularProgress size={16} />}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
