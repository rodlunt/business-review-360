import React, { useState, useEffect, useContext } from "react";
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
import { SettingsContext } from "../contexts";
import { useSnackbar } from "./GlobalSnackbar";

export default function GeneralSettingsModal({ open, onClose, currentSettings, onSettingsUpdate }) {
  const { setLogoHighContrast } = useContext(SettingsContext);
  const [settings, setSettings] = useState({
    useCaptcha: true,
    enablePwaPrompt: false,
    logoHighContrast: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const { showSnackbar } = useSnackbar();

  // Initialize settings from currentSettings prop
  useEffect(() => {
    if (open && currentSettings) {
      setSettings({
        useCaptcha: currentSettings.useCaptcha !== "false" && currentSettings.useCaptcha !== false,
        enablePwaPrompt:
          currentSettings.enablePwaPrompt !== "false" && currentSettings.enablePwaPrompt !== false,
        logoHighContrast:
          currentSettings.logoHighContrast === true || currentSettings.logoHighContrast === "true",
      });
      setHasChanges(false);
      setError("");
    }
  }, [open, currentSettings]);

  const handleChange = (field) => (event) => {
    setSettings((prev) => ({
      ...prev,
      [field]: event.target.checked,
    }));
    setHasChanges(true);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      // Save all settings in one request
      await api.post("/settings", settings);

      // Update high contrast mode in context immediately
      setLogoHighContrast(settings.logoHighContrast);

      // Notify parent to reload settings
      if (onSettingsUpdate) {
        await onSettingsUpdate();
      }

      showSnackbar("Settings saved", "success");
      onClose();
    } catch (err) {
      console.error("Error saving general settings:", err);
      setError(err.response?.data?.error || "Failed to save settings. Please try again.");
      showSnackbar(
        err.response?.data?.error || "Failed to save settings. Please try again.",
        "error"
      );
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
          General Settings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: SPACING.micro }}>
          Configure general application behaviour
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: SPACING.large }}>
          {/* Use CAPTCHA */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.useCaptcha}
                  onChange={handleChange("useCaptcha")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Use CAPTCHA
                </Typography>
              }
              sx={{ mb: 0.5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4.5 }}>
              {settings.useCaptcha
                ? "reCAPTCHA v3 verification enabled for anonymous registrations"
                : "CAPTCHA verification disabled (increases spam risk)"}
            </Typography>
          </Box>

          <Divider />

          {/* Enable PWA Prompt */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enablePwaPrompt}
                  onChange={handleChange("enablePwaPrompt")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Enable PWA Prompt
                </Typography>
              }
              sx={{ mb: 0.5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4.5 }}>
              {settings.enablePwaPrompt
                ? "Users will be prompted to install the app"
                : "PWA installation prompt is disabled"}
            </Typography>
          </Box>

          <Divider />

          {/* Logo High Contrast Mode */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.logoHighContrast}
                  onChange={handleChange("logoHighContrast")}
                  disabled={saving}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  High Contrast Mode
                </Typography>
              }
              sx={{ mb: 0.5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4.5 }}>
              {settings.logoHighContrast
                ? "White background added to improve logo visibility on coloured headers"
                : "Logo displayed without background (may be harder to see on some colours)"}
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
