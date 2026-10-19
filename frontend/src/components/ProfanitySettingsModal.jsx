import React, { useState, useEffect, useContext } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Chip,
  Alert,
  Stack,
  CircularProgress,
  Paper,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { api } from "../api";
import { useSnackbar } from "./GlobalSnackbar";
import { SPACING } from "../muiTheme";
import useOrganizationId from "../hooks/useOrganizationId";

export default function ProfanitySettingsModal({ open, onClose, onSettingsUpdate }) {
  const [enabled, setEnabled] = useState(true);
  const [customWords, setCustomWords] = useState([]);
  const [newWord, setNewWord] = useState("");
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const { showSnackbar } = useSnackbar();
  // "demo-corp" must match DEMO_ORG_ID in backend (profanitySettings.js).
  // The shared demo org locks profanity config server-side; reflect that here.
  const isDemoOrg = useOrganizationId() === "demo-corp";

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get("/profanity-settings");
      setEnabled(response.data.enabled);
      setCustomWords(response.data.customWords || []);
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to load profanity settings:", err);
      setError("Failed to load profanity filter settings");
    } finally {
      setLoading(false);
    }
  };

  // Load settings when modal opens
  useEffect(() => {
    if (open) {
      loadSettings();
      // Reset test fields when opening
      setTestText("");
      setTestResult(null);
      setError("");
      setSuccess("");
    }
  }, [open]);

  // Auto-dismiss success alert after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Auto-dismiss error alert after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/profanity-settings", {
        enabled,
        customWords,
      });
      setSuccess("Profanity filter settings saved successfully");
      showSnackbar("Profanity filter settings saved", "success");
      setHasChanges(false);
      if (onSettingsUpdate) {
        await onSettingsUpdate();
      }
      // Close modal after successful save
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Failed to save profanity settings:", err);
      const msg = err.response?.data?.error || "Failed to save profanity filter settings";
      setError(msg);
      showSnackbar(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddWord = () => {
    const word = newWord.trim().toLowerCase();
    if (word && !customWords.includes(word)) {
      setCustomWords([...customWords, word]);
      setNewWord("");
      setHasChanges(true);
    }
  };

  const handleRemoveWord = (wordToRemove) => {
    setCustomWords(customWords.filter((word) => word !== wordToRemove));
    setHasChanges(true);
  };

  const handleTest = async () => {
    if (!testText.trim()) {
      setTestResult(null);
      return;
    }

    try {
      const response = await api.post("/profanity-settings/test", {
        text: testText,
      });
      setTestResult(response.data);
    } catch (err) {
      console.error("Failed to test text:", err);
      setError("Failed to test text for profanity");
    }
  };

  const handleEnabledChange = (e) => {
    setEnabled(e.target.checked);
    setHasChanges(true);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Profanity Filter Settings</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
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

            {isDemoOrg && (
              <Alert severity="info" sx={{ mb: SPACING.medium }}>
                Profanity settings are locked on the demo organisation and cannot be changed here.
              </Alert>
            )}

            <Stack spacing={SPACING.large} sx={{ mt: SPACING.small }}>
              {/* Enable/Disable Toggle */}
              <FormControlLabel
                control={
                  <Switch
                    checked={enabled}
                    onChange={handleEnabledChange}
                    color="primary"
                    disabled={isDemoOrg}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">Enable Profanity Filter</Typography>
                    <Typography variant="caption" color="text.secondary">
                      When enabled, inappropriate language will be blocked from all user inputs
                    </Typography>
                  </Box>
                }
              />

              {/* Custom Words Section */}
              <Box>
                <Typography variant="h6" sx={{ mb: SPACING.medium, fontWeight: 600 }}>
                  Custom Blocked Words
                </Typography>
                <Typography variant="caption" color="text.secondary" paragraph>
                  Add custom words or phrases to block in addition to the standard profanity list
                </Typography>

                <Box sx={{ display: "flex", gap: SPACING.small, mb: SPACING.medium }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Enter word or phrase"
                    disabled={isDemoOrg}
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddWord();
                      }
                    }}
                    sx={{
                      "& .MuiInputBase-root": {
                        height: 40,
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddWord}
                    disabled={!newWord.trim() || isDemoOrg}
                  >
                    Add
                  </Button>
                </Box>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: SPACING.small, minHeight: 40 }}>
                  {customWords.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No custom words added yet
                    </Typography>
                  ) : (
                    customWords.map((word) => (
                      <Chip
                        key={word}
                        label={word}
                        onDelete={() => handleRemoveWord(word)}
                        deleteIcon={<DeleteIcon />}
                      />
                    ))
                  )}
                </Box>
              </Box>

              {/* Test Section */}
              <Box>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Test Profanity Filter
                </Typography>
                <Typography variant="caption" color="text.secondary" paragraph>
                  Test how the filter will respond to specific text
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Enter text to test..."
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  sx={{ mb: SPACING.small }}
                />

                <Button
                  variant="outlined"
                  onClick={handleTest}
                  disabled={!testText.trim() || !enabled}
                >
                  Test Text
                </Button>

                {testResult && (
                  <Paper
                    elevation={0}
                    sx={{
                      mt: SPACING.medium,
                      p: SPACING.medium,
                      bgcolor: testResult.isProfane ? "error.light" : "success.light",
                      color: testResult.isProfane ? "error.contrastText" : "success.contrastText",
                    }}
                  >
                    <Typography variant="subtitle2" gutterBottom>
                      {testResult.isProfane ? "❌ Profanity Detected" : "✅ Text is Clean"}
                    </Typography>
                    {testResult.isProfane && testResult.cleanText && (
                      <Typography variant="body2">Filtered text: {testResult.cleanText}</Typography>
                    )}
                  </Paper>
                )}
              </Box>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || saving || !hasChanges || isDemoOrg}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
