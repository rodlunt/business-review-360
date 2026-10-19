import React, { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle, Error as ErrorIcon, SmartToy } from "@mui/icons-material";
import { api } from "../api";

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
];

export default function AISettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validationResult, setValidationResult] = useState(null);

  const [aiMode, setAiMode] = useState("disabled");
  const [aiProvider, setAiProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    api
      .get("/ai-settings")
      .then((res) => {
        setAiMode(res.data.aiMode ?? "disabled");
        setAiProvider(res.data.aiProvider ?? "anthropic");
        setHasExistingKey(res.data.hasApiKey);
      })
      .catch(() => setError("Failed to load AI settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = { aiMode, aiProvider };
      if (aiMode === "byo" && apiKey) body.apiKey = apiKey;
      await api.put("/ai-settings", body);
      setSuccess("AI settings saved.");
      if (apiKey) {
        setHasExistingKey(true);
        setApiKey("");
      }
      if (aiMode !== "byo") setHasExistingKey(false);
    } catch (err) {
      setError(err.response?.data?.error ?? "Failed to save AI settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const body = aiMode === "byo" && apiKey ? { apiKey, aiProvider } : {};
      const res = await api.post("/ai-settings/validate", body);
      setValidationResult(res.data);
    } catch {
      setValidationResult({ valid: false, error: "Validation request failed" });
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <Card variant="outlined">
        <CardContent sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <SmartToy sx={{ color: "primary.main" }} />
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
            AI Integration
          </Typography>
          <Chip
            size="small"
            label="Beta"
            color="primary"
            variant="outlined"
            sx={{ ml: 1, fontSize: "0.65rem" }}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enable AI-powered features (predictive analytics, admin reply suggestions, idea
          classification). Choose between supplying your own API key or using the BR360 managed
          service.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        <RadioGroup
          value={aiMode}
          onChange={(e) => {
            setAiMode(e.target.value);
            setValidationResult(null);
          }}
        >
          <FormControlLabel
            value="disabled"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Disabled
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  No AI features enabled for this organisation
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="byo"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Bring your own key
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Use your own API key. You are billed directly by the provider.
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="managed"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Managed (BR360)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  BR360 provides access to a tuned model. Billed as a platform add-on.
                </Typography>
              </Box>
            }
          />
        </RadioGroup>

        {aiMode === "byo" && (
          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Divider />
            <FormControl size="small" sx={{ maxWidth: 280 }}>
              <InputLabel>Provider</InputLabel>
              <Select
                value={aiProvider}
                label="Provider"
                onChange={(e) => {
                  setAiProvider(e.target.value);
                  setValidationResult(null);
                }}
              >
                {PROVIDERS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label={hasExistingKey ? "New API key (leave blank to keep existing)" : "API key"}
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationResult(null);
              }}
              placeholder={hasExistingKey ? "••••••••" : "sk-ant-..."}
              sx={{ maxWidth: 420 }}
              helperText="Stored encrypted. Never logged or exposed."
            />
          </Box>
        )}

        {validationResult && (
          <Alert
            severity={validationResult.valid ? "success" : "error"}
            icon={validationResult.valid ? <CheckCircle /> : <ErrorIcon />}
            sx={{ mt: 2 }}
          >
            {validationResult.valid
              ? "Credentials validated successfully."
              : `Validation failed: ${validationResult.error}`}
          </Alert>
        )}

        <Box sx={{ mt: 3, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : "Save"}
          </Button>
          {aiMode !== "disabled" && (
            <Button variant="outlined" onClick={handleValidate} disabled={validating || saving}>
              {validating ? <CircularProgress size={18} color="inherit" /> : "Test connection"}
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
