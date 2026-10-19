import React, { useState, useEffect, useContext } from "react";
import { api } from "../api";
import { ThemeContext, SettingsContext } from "../contexts";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Email as EmailIcon,
  AdminPanelSettings as AdminIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { SPACING } from "../muiTheme";

export default function NotificationSettings() {
  // SECURITY: Validate user can only access their own org
  useOrgAccessGuard();

  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const theme = useContext(ThemeContext);
  const { primaryColor } = useContext(SettingsContext);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/notifications/preferences");
      setPreferences(response.data);
    } catch (err) {
      console.error("Failed to load notification preferences:", err);
      setError("Failed to load notification preferences. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  // Issue #626: page-owned document.title via the shared usePageTitle hook.
  usePageTitle("Notification Settings");

  const savePreferences = async (updates) => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const response = await api.put("/notifications/preferences", updates);
      setPreferences(response.data);
      setSuccess("Preferences saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Failed to save notification preferences:", err);
      setError("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (field) => (event) => {
    const newValue = event.target.checked;
    setPreferences((prev) => ({ ...prev, [field]: newValue }));
    savePreferences({ [field]: newValue });
  };

  const handleFrequencyChange = (field) => (event) => {
    const newValue = event.target.value;
    setPreferences((prev) => ({ ...prev, [field]: newValue }));
    savePreferences({ [field]: newValue });
  };

  const handleResetToDefaults = async () => {
    if (!window.confirm("Reset all notification preferences to defaults?")) {
      return;
    }
    try {
      setSaving(true);
      setError("");
      const response = await api.post("/notifications/preferences/reset");
      setPreferences(response.data);
      setSuccess("Preferences reset to defaults!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Failed to reset preferences:", err);
      setError("Failed to reset preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!preferences) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error || "Unable to load notification preferences."}
        <Button onClick={loadPreferences} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" component="h1" sx={{ mb: SPACING.large }}>
        Notification Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: SPACING.medium }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: SPACING.medium }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* Global Unsubscribe Warning */}
      {preferences.globalUnsubscribe && (
        <Alert severity="warning" sx={{ mb: SPACING.medium }}>
          You have unsubscribed from all emails. Only critical emails (like password resets) will be
          sent.
        </Alert>
      )}

      {/* Email Frequency */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", mb: SPACING.medium }}>
            <EmailIcon sx={{ mr: 1, color: "text.secondary" }} />
            <Typography variant="h6">Email Frequency</Typography>
          </Box>
          <FormControl fullWidth disabled={preferences.globalUnsubscribe || saving}>
            <InputLabel>Notification Frequency</InputLabel>
            <Select
              value={preferences.emailFrequency || "realtime"}
              label="Notification Frequency"
              onChange={handleFrequencyChange("emailFrequency")}
            >
              <MenuItem value="realtime">Real-time (immediate)</MenuItem>
              <MenuItem value="hourly">Hourly digest</MenuItem>
              <MenuItem value="daily">Daily digest</MenuItem>
              <MenuItem value="weekly">Weekly digest</MenuItem>
              <MenuItem value="off">Off (no emails)</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mt: SPACING.micro }}>
            Controls how often you receive non-critical notification emails.
          </Typography>
        </CardContent>
      </Card>

      {/* User Notifications */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Idea Notifications</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: "flex", flexDirection: "column", gap: SPACING.small }}>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.commentsOnIdeas}
                  onChange={handleToggle("commentsOnIdeas")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Comments on my ideas</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get notified when someone comments on an idea you submitted
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.repliesToComments}
                  onChange={handleToggle("repliesToComments")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Replies to my comments</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get notified when someone replies to your comment
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.statusChanges}
                  onChange={handleToggle("statusChanges")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Status changes</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get notified when your idea's status is updated
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.ideaImplemented}
                  onChange={handleToggle("ideaImplemented")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Idea implemented</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get a celebration email when your idea is implemented
                  </Typography>
                </Box>
              }
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Digest Notifications */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Digest & Summary Emails</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.newIdeas}
                  onChange={handleToggle("newIdeas")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>New ideas in organisation</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Get notified about new ideas submitted by others
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.weeklySummary}
                  onChange={handleToggle("weeklySummary")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Weekly activity summary</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Receive a weekly summary of activity in your organisation
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.monthlyReports}
                  onChange={handleToggle("monthlyReports")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Monthly reports</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Receive monthly organisation reports and insights
                  </Typography>
                </Box>
              }
            />
            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={preferences.engagementEmails}
                  onChange={handleToggle("engagementEmails")}
                  disabled={preferences.globalUnsubscribe || saving}
                />
              }
              label={
                <Box>
                  <Typography>Tips & engagement emails</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Receive helpful tips and engagement reminders
                  </Typography>
                </Box>
              }
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Admin Notifications - Only shown for admins */}
      {preferences.isAdmin && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <AdminIcon sx={{ mr: 1, color: "warning.main" }} />
              <Typography variant="h6">Admin Notifications</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.adminNewIdeas}
                    onChange={handleToggle("adminNewIdeas")}
                    disabled={preferences.globalUnsubscribe || saving}
                  />
                }
                label={
                  <Box>
                    <Typography>New idea submissions</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Get notified when new ideas are submitted
                    </Typography>
                  </Box>
                }
              />

              {preferences.adminNewIdeas && (
                <FormControl
                  sx={{ ml: 4, maxWidth: 300 }}
                  disabled={preferences.globalUnsubscribe || saving}
                >
                  <InputLabel>Frequency</InputLabel>
                  <Select
                    value={preferences.adminNewIdeasFrequency || "realtime"}
                    label="Frequency"
                    onChange={handleFrequencyChange("adminNewIdeasFrequency")}
                    size="small"
                  >
                    <MenuItem value="realtime">Real-time (immediate)</MenuItem>
                    <MenuItem value="hourly">Hourly digest</MenuItem>
                    <MenuItem value="daily">Daily digest</MenuItem>
                    <MenuItem value="weekly">Weekly digest</MenuItem>
                  </Select>
                </FormControl>
              )}
              <Divider />

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.adminNeedsAttention}
                    onChange={handleToggle("adminNeedsAttention")}
                    disabled={preferences.globalUnsubscribe || saving}
                  />
                }
                label={
                  <Box>
                    <Typography>Ideas needing attention</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Weekly digest of ideas that have been pending review too long
                    </Typography>
                  </Box>
                }
              />
              <Divider />

              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.adminMonthlySummary}
                    onChange={handleToggle("adminMonthlySummary")}
                    disabled={preferences.globalUnsubscribe || saving}
                  />
                }
                label={
                  <Box>
                    <Typography>Monthly admin summary</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Receive monthly admin summary with metrics and trends
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Global Unsubscribe */}
      <Card
        sx={{ mt: SPACING.large, borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }}
      >
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.globalUnsubscribe}
                onChange={handleToggle("globalUnsubscribe")}
                disabled={saving}
                color="error"
              />
            }
            label={
              <Box>
                <Typography color="error.main" fontWeight="medium">
                  Unsubscribe from all emails
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Only critical emails (like password resets) will be sent. You will miss all
                  notifications.
                </Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Box sx={{ mt: SPACING.large, display: "flex", justifyContent: "flex-end" }}>
        <Tooltip title="Reset all preferences to default values">
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleResetToDefaults}
            disabled={saving}
          >
            Reset to Defaults
          </Button>
        </Tooltip>
      </Box>
    </Box>
  );
}
