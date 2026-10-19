import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Switch,
  RadioGroup,
  Radio,
  TextField,
  Box,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import { Close, Add, Delete, CheckCircle, Cancel } from "@mui/icons-material";
import { api } from "../api";
import { SPACING } from "../muiTheme";

export default function RegistrationSettingsModal({
  open,
  onClose,
  currentSettings,
  onSettingsUpdate,
}) {
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(true);
  const [domainRestrictionMode, setDomainRestrictionMode] = useState("none");
  const [allowedDomains, setAllowedDomains] = useState([]);
  const [blockedDomains, setBlockedDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load current settings when modal opens
  useEffect(() => {
    if (open && currentSettings) {
      setAllowSelfRegistration(currentSettings.allowSelfRegistration ?? true);
      setDomainRestrictionMode(currentSettings.domainRestrictionMode || "none");
      setAllowedDomains(currentSettings.allowedDomains || []);
      setBlockedDomains(currentSettings.blockedDomains || []);
      setError("");
      setTestResult(null);
    }
  }, [open, currentSettings]);

  const validateDomain = (domain) => {
    // Simple domain validation (allows @domain.com or domain.com)
    const domainRegex = /^@?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  };

  const normalizeDomain = (domain) => {
    // Ensure domain starts with @
    return domain.startsWith("@") ? domain : `@${domain}`;
  };

  const handleAddDomain = (type) => {
    if (!newDomain.trim()) return;

    const normalizedDomain = normalizeDomain(newDomain.trim());

    if (!validateDomain(normalizedDomain)) {
      setError("Invalid domain format. Use format: @example.com or example.com");
      return;
    }

    if (type === "allowed") {
      if (allowedDomains.includes(normalizedDomain)) {
        setError("Domain already in allowed list");
        return;
      }
      setAllowedDomains([...allowedDomains, normalizedDomain]);
    } else {
      if (blockedDomains.includes(normalizedDomain)) {
        setError("Domain already in blocked list");
        return;
      }
      setBlockedDomains([...blockedDomains, normalizedDomain]);
    }

    setNewDomain("");
    setError("");
  };

  const handleRemoveDomain = (domain, type) => {
    if (type === "allowed") {
      setAllowedDomains(allowedDomains.filter((d) => d !== domain));
    } else {
      setBlockedDomains(blockedDomains.filter((d) => d !== domain));
    }
  };

  const testEmailAccess = () => {
    if (!testEmail.includes("@")) {
      setTestResult({ allowed: false, message: "Invalid email format" });
      return;
    }

    const emailDomain = "@" + testEmail.split("@")[1];
    let allowed = false;
    let message = "";

    if (!allowSelfRegistration) {
      allowed = false;
      message = "Self-registration is disabled";
    } else if (domainRestrictionMode === "none") {
      allowed = true;
      message = "All domains allowed";
    } else if (domainRestrictionMode === "whitelist") {
      allowed = allowedDomains.includes(emailDomain);
      message = allowed
        ? `Domain ${emailDomain} is in allowed list`
        : `Domain ${emailDomain} is not in allowed list`;
    } else if (domainRestrictionMode === "blacklist") {
      allowed = !blockedDomains.includes(emailDomain);
      message = allowed
        ? `Domain ${emailDomain} is not blocked`
        : `Domain ${emailDomain} is in blocked list`;
    }

    setTestResult({ allowed, message });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      // Validate settings
      if (domainRestrictionMode === "whitelist" && allowedDomains.length === 0) {
        setError("Whitelist mode requires at least one allowed domain");
        setSaving(false);
        return;
      }

      const updates = {
        allowSelfRegistration,
        domainRestrictionMode,
        allowedDomains,
        blockedDomains,
      };

      await api.post("/settings", updates);

      // Notify parent component
      if (onSettingsUpdate) {
        onSettingsUpdate();
      }

      onClose();
    } catch (err) {
      console.error("Failed to save registration settings:", err);
      setError(`Failed to save settings: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? null : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: "500px",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="div">
          Registration Settings
        </Typography>
        <IconButton onClick={onClose} disabled={saving} size="small" aria-label="close">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: SPACING.medium }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {/* Self-Registration Toggle */}
        <Box sx={{ mb: SPACING.large }}>
          <FormControlLabel
            control={
              <Switch
                checked={allowSelfRegistration}
                onChange={(e) => setAllowSelfRegistration(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Allow Self-Registration
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Let users create accounts without admin approval
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ my: SPACING.large }} />

        {/* Domain Restrictions */}
        <Box sx={{ mb: SPACING.large }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Email Domain Restrictions
          </Typography>

          <RadioGroup
            value={domainRestrictionMode}
            onChange={(e) => setDomainRestrictionMode(e.target.value)}
          >
            <FormControlLabel
              value="none"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">Allow all domains</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Any email address can register
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              value="whitelist"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">Allow only specific domains</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Only users with approved email domains can register
                  </Typography>
                </Box>
              }
              sx={{ mt: SPACING.medium }}
            />

            {domainRestrictionMode === "whitelist" && (
              <Box sx={{ ml: SPACING.xlarge, mt: SPACING.small }}>
                <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                  <TextField
                    size="small"
                    placeholder="@example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleAddDomain("allowed");
                      }
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleAddDomain("allowed")}
                    startIcon={<Add />}
                    size="small"
                  >
                    Add
                  </Button>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: SPACING.small }}>
                  {allowedDomains.map((domain) => (
                    <Chip
                      key={domain}
                      label={domain}
                      onDelete={() => handleRemoveDomain(domain, "allowed")}
                      deleteIcon={<Delete />}
                      size="small"
                    />
                  ))}
                  {allowedDomains.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No allowed domains yet. Add at least one.
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            <FormControlLabel
              value="blacklist"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">Block specific domains</Typography>
                  <Typography variant="body2" color="text.secondary">
                    All domains except blocked ones can register
                  </Typography>
                </Box>
              }
              sx={{ mt: 2 }}
            />

            {domainRestrictionMode === "blacklist" && (
              <Box sx={{ ml: SPACING.xlarge, mt: SPACING.small }}>
                <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                  <TextField
                    size="small"
                    placeholder="@spam.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleAddDomain("blocked");
                      }
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleAddDomain("blocked")}
                    startIcon={<Add />}
                    size="small"
                  >
                    Add
                  </Button>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: SPACING.small }}>
                  {blockedDomains.map((domain) => (
                    <Chip
                      key={domain}
                      label={domain}
                      onDelete={() => handleRemoveDomain(domain, "blocked")}
                      deleteIcon={<Delete />}
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  ))}
                  {blockedDomains.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No blocked domains
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </RadioGroup>
        </Box>

        <Divider sx={{ my: SPACING.large }} />

        {/* Test Email Section */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Test Email Access
          </Typography>
          <Box sx={{ display: "flex", gap: SPACING.small, mb: SPACING.small }}>
            <TextField
              size="small"
              placeholder="user@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  testEmailAccess();
                }
              }}
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" onClick={testEmailAccess} size="small">
              Test
            </Button>
          </Box>
          {testResult && (
            <Alert
              severity={testResult.allowed ? "success" : "error"}
              icon={testResult.allowed ? <CheckCircle /> : <Cancel />}
              sx={{ mt: SPACING.micro }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {testResult.allowed ? "Allowed" : "Blocked"}
              </Typography>
              <Typography variant="body2">{testResult.message}</Typography>
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving && <CircularProgress size={16} />}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
