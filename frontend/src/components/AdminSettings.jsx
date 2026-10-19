import React, { useState, useEffect, useRef, useContext, memo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, API_BASE_URL } from "../api";
import { ThemeContext, SettingsContext } from "../contexts";
import AdminUserManager from "./AdminUserManager";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { usePageTitle } from "../hooks/usePageTitle";
import { useAuth } from "../auth";
import RegistrationSettingsModal from "./RegistrationSettingsModal";
import BulkUploadModal from "./BulkUploadModal";
import GeneralSettingsModal from "./GeneralSettingsModal";
import ProfanitySettingsModal from "./ProfanitySettingsModal";
import CommentTemplatesModal from "./CommentTemplatesModal";
import OAuthSettingsModal from "./OAuthSettingsModal";
import PlanLimitsCard from "./PlanLimitsCard";
import AISettingsPanel from "./AISettingsPanel";
import ConsultantsPanel from "./ConsultantsPanel";
import CategoryManager from "./CategoryManager";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Divider,
  TextField,
  Switch,
  FormControlLabel,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Tooltip,
} from "@mui/material";
import {
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  FilterList as FilterListIcon,
  AdminPanelSettings as AdminIcon,
  Settings as SettingsIcon,
  Upload as UploadIcon,
  DataObject as DataObjectIcon,
  DeleteOutlined as DeleteOutlineIcon,
  Close as CloseIcon,
  Colorize as EyedropperIcon,
} from "@mui/icons-material";

function LogoUpload({ onUpload }) {
  const [logoFile, setLogoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef();

  const handleLogoChange = (e) => {
    setError("");
    setSuccess("");
    const f = e.target.files && e.target.files[0];
    setLogoFile(f || null);
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const form = new FormData();
      form.append("logo", logoFile);

      const res = await api.post("/settings/upload-logo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSuccess("Logo uploaded successfully!");
      setLogoFile(null);
      if (onUpload) onUpload(res.data.logoUrl);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Upload error:", err);
      const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message;
      setError(`Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        alignItems: { xs: "stretch", sm: "flex-end" },
        width: { xs: "100%", sm: "auto" },
      }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleLogoChange}
        ref={fileInputRef}
        aria-label="Upload logo image"
        data-testid="logo-file-input"
        id="logo-file-input"
        style={{ display: "none" }}
      />
      <Box
        sx={{
          display: "flex",
          gap: 1,
          width: { xs: "100%", sm: "auto" },
        }}
      >
        <Button
          component="label"
          htmlFor="logo-file-input"
          variant="outlined"
          data-testid="choose-logo-file"
          size="small"
          sx={{
            cursor: "pointer",
            minWidth: { xs: 0, sm: 110 },
            flex: { xs: 1, sm: "0 0 auto" },
            whiteSpace: "nowrap",
          }}
        >
          Choose File
        </Button>
        <Button
          type="button"
          onClick={handleLogoUpload}
          disabled={!logoFile || uploading}
          data-testid="upload-logo-button"
          variant={logoFile && !uploading ? "contained" : "outlined"}
          size="small"
          sx={{
            minWidth: { xs: 0, sm: 110 },
            flex: { xs: 1, sm: "0 0 auto" },
            whiteSpace: "nowrap",
          }}
        >
          {uploading ? <CircularProgress size={16} color="inherit" /> : "Upload"}
        </Button>
      </Box>

      {logoFile && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            maxWidth: { xs: "100%", sm: 230 },
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.7rem",
          }}
        >
          {logoFile.name}
        </Typography>
      )}

      {(error || success) && (
        <Box sx={{ width: { xs: "100%", sm: 230 } }}>
          {error && (
            <Alert severity="error" sx={{ py: 0.25, fontSize: "0.7rem" }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ py: 0.25, fontSize: "0.7rem" }}>
              {success}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}

function OrganizationSettingsBase({
  settings,
  setSettings,
  setPrimaryColor,
  location,
  onSettingsUpdate,
}) {
  const [orgSettings, setOrgSettings] = useState({
    organizationId: "",
    organizationName: "",
    organizationDescription: "",
    bigQuestion: "",
    primaryColor: "#1565c0", // Marketing website primary color
  });
  const [saving, setSaving] = useState(false);
  const [orgError, setOrgError] = useState("");
  const [orgSuccess, setOrgSuccess] = useState("");
  const [checkingId, setCheckingId] = useState(false);
  const [idAvailable, setIdAvailable] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    // If settings are loaded, use them; otherwise initialize with localStorage orgId
    const orgId = settings.organizationId || localStorage.getItem("organizationId") || "";

    setOrgSettings({
      organizationId: orgId,
      organizationName: settings.organizationName || "",
      organizationDescription: settings.organizationDescription ?? "",
      bigQuestion: settings.bigQuestion ?? "",
      primaryColor: settings.primaryColor || "#1565c0",
    });
  }, [settings]);

  // Auto-dismiss success message after 4 seconds
  useEffect(() => {
    if (orgSuccess) {
      const timer = setTimeout(() => setOrgSuccess(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [orgSuccess]);

  const checkIdAvailability = async (id) => {
    if (!id || id === settings.organizationId) {
      setIdAvailable(null);
      return;
    }

    setCheckingId(true);
    try {
      const response = await api.get(`/settings/organization/${id}/check`);
      setIdAvailable(!response.data.exists);
    } catch (err) {
      console.error("Error checking ID availability:", err);
      setIdAvailable(null);
    } finally {
      setCheckingId(false);
    }
  };

  const handleOrgChange = (field) => (event) => {
    const value = event.target.value;
    setOrgSettings((prev) => ({ ...prev, [field]: value }));
    setOrgError("");
    setOrgSuccess("");

    // Check ID availability when organisation ID changes
    if (field === "organizationId" && value) {
      checkIdAvailability(value);
    } else if (field === "organizationId") {
      setIdAvailable(null);
    }
  };

  const handleOrgSave = async () => {
    setSaving(true);
    setOrgError("");
    setOrgSuccess("");

    try {
      const updates = {
        organizationId: orgSettings.organizationId,
        organizationName: orgSettings.organizationName,
        organizationDescription: orgSettings.organizationDescription,
        bigQuestion: orgSettings.bigQuestion,
        primaryColor: orgSettings.primaryColor,
      };

      const oldOrgId = settings.organizationId;
      await api.post("/settings", updates);
      setSettings((prev) => ({ ...prev, ...updates }));

      // Update global primary colour immediately without reload
      if (updates.primaryColor) {
        setPrimaryColor(updates.primaryColor);
      }

      // If organizationId changed, redirect to new URL
      if (updates.organizationId && updates.organizationId !== oldOrgId) {
        setOrgSuccess("Organisation ID updated! Redirecting...");
        setTimeout(() => {
          const newPath = location.pathname.replace(
            `/org/${oldOrgId}`,
            `/org/${updates.organizationId}`
          );
          window.location.href = newPath; // Full reload to update org context
        }, 1000);
        return;
      }

      setOrgSuccess("Organisation settings saved successfully!");
      if (onSettingsUpdate) onSettingsUpdate();
    } catch (err) {
      console.error("Error saving organisation settings:", err);
      setOrgError("Failed to save organisation settings");
    } finally {
      setSaving(false);
    }
  };

  const generateOrgId = () => {
    const randomId = Math.random().toString(36).substr(2, 8);
    const orgName = orgSettings.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const suggestedId = orgName ? `${orgName}-${randomId}` : `org-${randomId}`;
    setOrgSettings((prev) => ({ ...prev, organizationId: suggestedId }));
  };

  const handleCopyUrl = async () => {
    const baseDomain = import.meta.env.VITE_BASE_DOMAIN || "br360.example.com";
    const url = `https://${orgSettings.organizationId}.${baseDomain}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 3 }}>
          Organisation Settings
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <TextField
            label="Organisation Name"
            value={orgSettings.organizationName}
            onChange={handleOrgChange("organizationName")}
            fullWidth
            placeholder="e.g., Acme Corporation"
            data-testid="organization-name"
          />

          <TextField
            label="Organisation Description"
            value={orgSettings.organizationDescription}
            onChange={handleOrgChange("organizationDescription")}
            fullWidth
            multiline
            rows={3}
            placeholder="Brief description of your organisation and its mission"
            data-testid="organization-description"
          />

          <TextField
            label="The Big Question"
            value={orgSettings.bigQuestion}
            onChange={handleOrgChange("bigQuestion")}
            fullWidth
            multiline
            rows={2}
            placeholder="What's the main goal users should keep in mind when suggesting ideas?"
            data-testid="big-question"
            helperText="Displayed prominently on the idea submission page to guide users"
          />

          {/* Organisation ID and Landing URL: read-only info, stacks on mobile */}
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "flex-start",
              flexWrap: { xs: "wrap", sm: "nowrap" },
            }}
          >
            <TextField
              label="Organisation ID"
              value={orgSettings.organizationId}
              helperText="Cannot be changed"
              data-testid="organization-id"
              sx={{ flex: { xs: "1 0 100%", sm: "0 0 calc(50% - 8px)" } }}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: "monospace" },
              }}
              inputProps={{ "aria-label": "Organisation ID (read-only)" }}
            />

            {orgSettings.organizationId && (
              <TextField
                label="Landing Page URL"
                value={`https://${orgSettings.organizationId}.${import.meta.env.VITE_BASE_DOMAIN || "br360.example.com"}`}
                disabled
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton
                      size="small"
                      onClick={handleCopyUrl}
                      sx={{
                        color: urlCopied ? "success.main" : "action.active",
                        "&:hover": { color: "primary.main" },
                      }}
                      title={urlCopied ? "Copied!" : "Copy URL"}
                      aria-label={urlCopied ? "Copied" : "Copy landing page URL"}
                    >
                      <CopyIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  ),
                }}
                sx={{
                  flex: { xs: "1 0 100%", sm: "0 0 calc(50% - 8px)" },
                  "& .MuiInputBase-input.Mui-disabled": {
                    color: "text.primary",
                    WebkitTextFillColor: "text.primary",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    paddingRight: "8px",
                  },
                }}
              />
            )}
          </Box>

          {/* Primary colour: half-width on desktop, full-width on mobile */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "flex-start",
              flexWrap: { xs: "wrap", sm: "nowrap" },
            }}
          >
            <TextField
              label="Primary Colour"
              helperText="Used as the header background colour"
              value={orgSettings.primaryColor}
              onChange={handleOrgChange("primaryColor")}
              placeholder="#1565c0"
              data-testid="primary-color"
              sx={{ flex: { xs: "1 0 100%", sm: "0 0 calc(50% - 8px)" } }}
              InputProps={{
                startAdornment: (
                  <Box
                    component="input"
                    type="color"
                    aria-label="Primary colour swatch picker"
                    title="Primary colour swatch picker"
                    value={orgSettings.primaryColor || "#1565c0"}
                    onChange={handleOrgChange("primaryColor")}
                    sx={{
                      width: 40,
                      height: 40,
                      border: "none",
                      borderRadius: 1,
                      cursor: "pointer",
                      mr: 1,
                    }}
                  />
                ),
                endAdornment: (
                  <Tooltip title="Pick colour from screen">
                    <IconButton
                      aria-label="Pick colour from screen"
                      size="small"
                      onClick={async () => {
                        try {
                          const dropper = new window.EyeDropper();
                          const result = await dropper.open();
                          setOrgSettings((prev) => ({ ...prev, primaryColor: result.sRGBHex }));
                        } catch {
                          // user cancelled or browser unsupported (no-op)
                        }
                      }}
                    >
                      <EyedropperIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              onClick={handleOrgSave}
              disabled={saving || !orgSettings.organizationName || !orgSettings.organizationId}
              data-testid="save-organization-settings"
              size="small"
              sx={{ minWidth: 120 }}
            >
              {saving ? (
                <CircularProgress size={20} color="inherit" aria-label="Saving" />
              ) : (
                "Save Settings"
              )}
            </Button>
          </Box>

          {orgError && (
            <Alert severity="error" sx={{ mt: 1 }} data-testid="org-settings-error">
              {orgError}
            </Alert>
          )}
          {orgSuccess && (
            <Alert severity="success" sx={{ mt: 1 }} data-testid="org-settings-success">
              {orgSuccess}
            </Alert>
          )}

          {/* System info: diagnostic, not a setting */}
          <Divider />
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="caption" color="text.secondary">
              Build:{" "}
              <Box component="span" sx={{ fontFamily: "monospace", color: "text.primary" }}>
                {import.meta.env.VITE_BUILD_NUMBER || "unknown"}
              </Box>
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

const OrganizationSettings = memo(OrganizationSettingsBase);

export default function AdminSettings({ onSettingsUpdate, user: propUser }) {
  // SECURITY: Validate user can only access their own org
  useOrgAccessGuard();
  // Issue #626: page-owned document.title.
  usePageTitle("Admin");

  const { loading: authLoading } = useAuth();
  // Issue #769: superuser gates org settings, branding, export, and profanity config.
  const isSuperuser = !!propUser?.isSuperuser;
  const [settings, setSettings] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exportLoading, setExportLoading] = useState({});
  const [demoLoading, setDemoLoading] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [filterAdminOnly, setFilterAdminOnly] = useState(false);
  const [deleteLogoConfirmOpen, setDeleteLogoConfirmOpen] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false);
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false);
  const [generalSettingsModalOpen, setGeneralSettingsModalOpen] = useState(false);
  const [profanityModalOpen, setProfanityModalOpen] = useState(false);
  const [commentTemplatesModalOpen, setCommentTemplatesModalOpen] = useState(false);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const theme = useContext(ThemeContext);
  // Only consume setPrimaryColor and setLogoUrl here (not logoHighContrast to avoid re-renders)
  const { setPrimaryColor, setLogoUrl } = useContext(SettingsContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Load settings on component mount
  useEffect(() => {
    // Wait for auth to be ready before making API calls
    if (authLoading) return;

    const loadSettings = async () => {
      try {
        // Get organisation ID from localStorage to load org-specific settings
        let orgId = localStorage.getItem("organizationId");

        // If no orgId in localStorage, try to get it from the user data
        if (!orgId) {
          const userStr = localStorage.getItem("user");
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              orgId = user.organizationId;
              if (orgId) {
                console.log("[AdminSettings] Using orgId from user data:", orgId);
                localStorage.setItem("organizationId", orgId); // Save for future use
              }
            } catch (e) {
              console.error("[AdminSettings] Failed to parse user data:", e);
            }
          }
        }

        if (!orgId) {
          console.error("[AdminSettings] No organisation ID found in localStorage or user data");
          console.error("[AdminSettings] localStorage keys:", Object.keys(localStorage));
          console.error(
            "[AdminSettings] localStorage orgId:",
            localStorage.getItem("organizationId")
          );
          console.error("[AdminSettings] localStorage user:", localStorage.getItem("user"));
          setError("Organisation not found");
          return;
        }

        console.log("[AdminSettings] Loading settings for org:", orgId);
        console.log(
          "[AdminSettings] Current localStorage orgId:",
          localStorage.getItem("organizationId")
        );
        const response = await api.get(`/settings/organization/${orgId}`);
        console.log("[AdminSettings] Loaded settings:", response.data);
        setSettings(response.data);
      } catch (err) {
        console.error("Failed to load settings:", err);
        if (err.response?.status === 403) {
          setError(
            "Access denied: You do not have permission to access this organisation's settings"
          );
        } else if (err.response?.status === 401) {
          setError("Authentication required: Please log in to access settings");
        } else if (err.response?.status === 404) {
          setError("Organisation not found");
        } else {
          setError(`Failed to load settings: ${err.response?.data?.error || err.message}`);
        }
      }
    };
    loadSettings();
  }, [authLoading]);

  // Auto-dismiss success and error alerts after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Export functionality handlers
  const handleExport = async (format) => {
    setExportLoading((prev) => ({ ...prev, [format]: true }));
    setError("");
    setSuccess("");

    try {
      const response = await api.get(`/export/${format}`, {
        responseType: "blob",
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ideas_export.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess(`Export completed successfully (${format.toUpperCase()})`);
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
      setError(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setExportLoading((prev) => ({ ...prev, [format]: false }));
    }
  };

  // Demo data handlers -- Issue #527
  const handleLoadDemoData = async () => {
    setDemoLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/settings/demo-data");
      setSettings((s) => ({ ...s, demoDataLoaded: true }));
      setSuccess("Demo data loaded. Your dashboard now shows 10 sample ideas.");
    } catch (err) {
      console.error("Load demo data failed:", err);
      setError(err.response?.data?.error || "Failed to load demo data.");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleRemoveDemoData = async () => {
    setDemoLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.delete("/settings/demo-data");
      setSettings((s) => ({ ...s, demoDataLoaded: false }));
      setSuccess("Demo data removed.");
    } catch (err) {
      console.error("Remove demo data failed:", err);
      setError(err.response?.data?.error || "Failed to remove demo data.");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleDeleteLogo = async () => {
    setDeletingLogo(true);
    setError("");
    setSuccess("");
    try {
      await api.delete("/settings/logo");
      setSettings((s) => ({ ...s, logoUrl: null }));
      setLogoUrl(null);
      setSuccess("Logo removed.");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete logo.");
    } finally {
      setDeletingLogo(false);
      setDeleteLogoConfirmOpen(false);
    }
  };

  // Profanity filter test handlers
  const handleTestFilter = async () => {
    if (!testText.trim()) {
      setTestResult(null);
      return;
    }

    setTestLoading(true);
    try {
      const response = await api.post("/profanity-settings/test", {
        text: testText,
      });
      setTestResult(response.data);
    } catch (err) {
      console.error("Failed to test profanity filter:", err);
      setTestResult({
        isProfane: false,
        message: "Error testing filter",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleCloseTestDialog = () => {
    setTestDialogOpen(false);
    setTestText("");
    setTestResult(null);
  };

  return (
    <Box
      sx={{
        maxWidth: 800,
        mx: "auto",
        my: 3,
        px: 2,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <Box textAlign="center">
        <Typography
          variant="h1"
          component="h1"
          sx={{
            color: "text.primary",
            mb: { xs: 1.5, sm: 2 },
          }}
        >
          Admin Settings
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            color: "text.secondary",
            mb: 0,
          }}
        >
          Manage application settings and user permissions
        </Typography>
      </Box>
      {error && (
        <Alert severity="error" data-testid="admin-settings-error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          severity="success"
          data-testid="admin-settings-success"
          onClose={() => setSuccess("")}
        >
          {success}
        </Alert>
      )}

      {isSuperuser && (
        <OrganizationSettings
          settings={settings}
          setSettings={setSettings}
          setPrimaryColor={setPrimaryColor}
          location={location}
          onSettingsUpdate={onSettingsUpdate}
        />
      )}

      {/* Plan & Usage Limits - Issue #354 */}
      <PlanLimitsCard />

      {/* Settings section -- superuser only */}
      {isSuperuser && (
        <Card variant="outlined" data-testid="superuser-settings-section">
          <CardContent>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
              Settings
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {/* General Settings row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    General Settings
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    CAPTCHA: {settings.useCaptcha ? "Enabled" : "Disabled"}
                    {" · "}
                    PWA: {settings.enablePwaPrompt ? "Enabled" : "Disabled"}
                    {" · "}
                    High Contrast: {settings.logoHighContrast ? "On" : "Off"}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<SettingsIcon />}
                  onClick={() => setGeneralSettingsModalOpen(true)}
                  size="small"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 110 }}
                >
                  Configure
                </Button>
              </Box>

              <Divider />

              {/* Registration Settings row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Registration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Self-registration: {settings.allowSelfRegistration ? "Enabled" : "Disabled"}
                    {settings.domainRestrictionMode &&
                      settings.domainRestrictionMode !== "none" && (
                        <>
                          {" · "}
                          {settings.domainRestrictionMode === "whitelist" &&
                            `Whitelist (${settings.allowedDomains?.length || 0} domains)`}
                          {settings.domainRestrictionMode === "blacklist" &&
                            `Blacklist (${settings.blockedDomains?.length || 0} domains)`}
                        </>
                      )}
                    {settings.domainRestrictionMode === "none" && " · All domains allowed"}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<SettingsIcon />}
                  onClick={() => setRegistrationModalOpen(true)}
                  size="small"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 110 }}
                >
                  Configure
                </Button>
              </Box>

              <Divider />

              {/* Comment Templates row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Comment Templates
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Saved replies for common admin comments. Insert in one click from the comment
                    box.
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<SettingsIcon />}
                  onClick={() => setCommentTemplatesModalOpen(true)}
                  size="small"
                  data-testid="manage-comment-templates"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 110 }}
                >
                  Configure
                </Button>
              </Box>

              <Divider />

              {/* Sign-in Providers row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Sign-in Providers
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[
                      settings.oauthGoogleEnabled && "Google",
                      settings.oauthGithubEnabled && "GitHub",
                      settings.oauthMicrosoftEnabled && "Microsoft",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No providers enabled"}
                    {settings.oauthAutoSuperuser && " · Auto-superuser on"}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<SettingsIcon />}
                  onClick={() => setOauthModalOpen(true)}
                  size="small"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 110 }}
                >
                  Configure
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* AI Integration section (issue #721) */}
      <AISettingsPanel />

      {/* Data section -- all admins */}
      <Card variant="outlined" data-testid="export-section">
        <CardContent>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
            Data
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {/* Data Export row */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: { xs: "stretch", sm: "flex-start" },
                gap: 2,
                py: 2,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Export Data
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Download all ideas in CSV or JSON format
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
                <Button
                  data-testid="export-csv"
                  variant="outlined"
                  startIcon={!exportLoading.csv && <DownloadIcon />}
                  onClick={() => handleExport("csv")}
                  disabled={exportLoading.csv}
                  size="small"
                  sx={{
                    flex: { xs: 1, sm: "0 0 auto" },
                    minWidth: { xs: 0, sm: 110 },
                    whiteSpace: "nowrap",
                  }}
                >
                  {exportLoading.csv ? (
                    <CircularProgress size={16} color="inherit" aria-label="Exporting CSV" />
                  ) : (
                    "CSV"
                  )}
                </Button>
                <Button
                  data-testid="export-json"
                  variant="outlined"
                  startIcon={!exportLoading.json && <DownloadIcon />}
                  onClick={() => handleExport("json")}
                  disabled={exportLoading.json}
                  size="small"
                  sx={{
                    flex: { xs: 1, sm: "0 0 auto" },
                    minWidth: { xs: 0, sm: 110 },
                    whiteSpace: "nowrap",
                  }}
                >
                  {exportLoading.json ? (
                    <CircularProgress size={16} color="inherit" aria-label="Exporting JSON" />
                  ) : (
                    "JSON"
                  )}
                </Button>
              </Box>
            </Box>

            <Divider />

            {/* Bulk User Upload row */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: { xs: "stretch", sm: "flex-start" },
                gap: 2,
                py: 2,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Bulk User Upload
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Import multiple user accounts from a CSV file. Each user receives a setup email to
                  set their own password.
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => {
                    const csvContent =
                      "username,email,isAdmin\nexampleuser,user@example.com,false\n,admin@example.com,true";
                    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", "bulk_users_template.csv");
                    link.style.visibility = "hidden";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  size="small"
                  sx={{
                    flex: { xs: 1, sm: "0 0 auto" },
                    minWidth: { xs: 0, sm: 110 },
                    whiteSpace: "nowrap",
                  }}
                >
                  Template
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={() => setBulkUploadModalOpen(true)}
                  size="small"
                  sx={{
                    flex: { xs: 1, sm: "0 0 auto" },
                    minWidth: { xs: 0, sm: 110 },
                    whiteSpace: "nowrap",
                  }}
                >
                  Upload
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Categories section -- all admins */}
      <Card variant="outlined" data-testid="categories-section">
        <CardContent>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Categories
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add or remove idea categories for your organisation.
          </Typography>
          <CategoryManager />
        </CardContent>
      </Card>

      {/* Data Management section -- superuser only */}
      {isSuperuser && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
              Data Management
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {/* Logo Upload row */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  justifyContent: "space-between",
                  alignItems: { xs: "stretch", sm: "flex-start" },
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Logo
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    PNG, JPG, or SVG · Max 5 MB · Ideal: 200x60 px
                  </Typography>
                  {settings.logoUrl && (
                    <Box sx={{ mt: 1.5, position: "relative", display: "inline-block" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          p: 0.5,
                          bgcolor: settings.primaryColor || "#1565c0",
                          borderRadius: 1,
                          height: 36,
                          width: 160,
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            ...(settings.logoHighContrast && {
                              backgroundColor: "rgb(255, 255, 255)",
                              borderRadius: 0.5,
                              padding: "2px 4px",
                              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                            }),
                          }}
                        >
                          <img
                            src={
                              settings.logoUrl?.startsWith("http")
                                ? settings.logoUrl
                                : `${API_BASE_URL}${settings.logoUrl}`
                            }
                            alt="Current logo"
                            style={{
                              maxHeight: 28,
                              maxWidth: "100%",
                              width: "auto",
                              display: "block",
                              objectFit: "contain",
                            }}
                          />
                        </Box>
                      </Box>
                      <Tooltip title="Remove logo">
                        <IconButton
                          size="small"
                          aria-label="Remove logo"
                          onClick={() => setDeleteLogoConfirmOpen(true)}
                          sx={{
                            position: "absolute",
                            top: -8,
                            right: -8,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: "divider",
                            width: 20,
                            height: 20,
                            "&:hover": {
                              bgcolor: "error.light",
                              color: "error.contrastText",
                              borderColor: "error.main",
                            },
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
                <LogoUpload
                  onUpload={(newLogoUrl) => {
                    setSettings((s) => ({ ...s, logoUrl: newLogoUrl }));
                    setLogoUrl(newLogoUrl);
                  }}
                />
              </Box>

              <Divider />

              {/* Demo Data row -- Issue #527 */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
                data-testid="demo-data-card"
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Demo Data
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {settings.demoDataLoaded
                      ? "Sample ideas are loaded. Remove them when ready to use real data."
                      : "Load 10 sample ideas to explore the dashboard. Demo ideas do not count towards plan limits."}
                  </Typography>
                </Box>
                <Box>
                  {settings.demoDataLoaded ? (
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={!demoLoading && <DeleteOutlineIcon />}
                      onClick={handleRemoveDemoData}
                      disabled={demoLoading}
                      size="small"
                      data-testid="remove-demo-data"
                      sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 130 }}
                    >
                      {demoLoading ? (
                        <CircularProgress
                          size={16}
                          color="inherit"
                          aria-label="Removing demo data"
                        />
                      ) : (
                        "Remove Demo"
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      startIcon={!demoLoading && <DataObjectIcon />}
                      onClick={handleLoadDemoData}
                      disabled={demoLoading}
                      size="small"
                      data-testid="load-demo-data"
                      sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 130 }}
                    >
                      {demoLoading ? (
                        <CircularProgress
                          size={16}
                          color="inherit"
                          aria-label="Loading demo data"
                        />
                      ) : (
                        "Load Demo"
                      )}
                    </Button>
                  )}
                </Box>
              </Box>

              <Divider />

              {/* Profanity Filter row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  py: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Profanity Filter
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure content filtering and manage blocked words
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<FilterListIcon />}
                  onClick={() => setProfanityModalOpen(true)}
                  size="small"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 110 }}
                >
                  Configure
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {propUser?.isPlatformOwner && (
        <Card variant="outlined" data-testid="user-manager-section">
          <CardContent>
            <AdminUserManager
              filterAdminOnly={filterAdminOnly}
              onFilterChange={setFilterAdminOnly}
            />
          </CardContent>
        </Card>
      )}

      {/* Consultants section -- superuser only (Issue #808) */}
      {isSuperuser && <ConsultantsPanel />}

      {/* Registration Settings Modal */}
      <RegistrationSettingsModal
        open={registrationModalOpen}
        onClose={() => setRegistrationModalOpen(false)}
        currentSettings={settings}
        onSettingsUpdate={async () => {
          // Reload settings after update
          const orgId = localStorage.getItem("organizationId");
          if (orgId) {
            const response = await api.get(`/settings/organization/${orgId}`);
            setSettings(response.data);
          }
          if (onSettingsUpdate) {
            onSettingsUpdate();
          }
        }}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        open={bulkUploadModalOpen}
        onClose={() => setBulkUploadModalOpen(false)}
        onSuccess={() => {
          // Refresh user list if needed
          setSuccess("Users uploaded successfully!");
        }}
      />

      {/* General Settings Modal */}
      <GeneralSettingsModal
        open={generalSettingsModalOpen}
        onClose={() => setGeneralSettingsModalOpen(false)}
        currentSettings={settings}
        onSettingsUpdate={async () => {
          // Reload settings after update
          const orgId = localStorage.getItem("organizationId");
          if (orgId) {
            const response = await api.get(`/settings/organization/${orgId}`);
            setSettings(response.data);
          }
          if (onSettingsUpdate) {
            onSettingsUpdate();
          }
        }}
      />

      {/* Profanity Settings Modal */}
      <ProfanitySettingsModal
        open={profanityModalOpen}
        onClose={() => setProfanityModalOpen(false)}
        onSettingsUpdate={async () => {
          // Reload settings after update (profanity settings are separate from org settings)
          if (onSettingsUpdate) {
            onSettingsUpdate();
          }
        }}
      />

      {/* Comment Templates Modal -- Issue #525 */}
      <CommentTemplatesModal
        open={commentTemplatesModalOpen}
        onClose={() => setCommentTemplatesModalOpen(false)}
        onTemplatesChange={() => {}}
      />

      {/* OAuth / Sign-in Providers Modal */}
      <OAuthSettingsModal
        open={oauthModalOpen}
        onClose={() => setOauthModalOpen(false)}
        currentSettings={settings}
        onSettingsUpdate={async () => {
          const orgId = localStorage.getItem("organizationId");
          if (orgId) {
            const response = await api.get(`/settings/organization/${orgId}`);
            setSettings(response.data);
          }
          if (onSettingsUpdate) {
            onSettingsUpdate();
          }
        }}
      />

      {/* Logo delete confirmation */}
      <Dialog
        open={deleteLogoConfirmOpen}
        onClose={() => !deletingLogo && setDeleteLogoConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Remove logo?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove the current logo. You can upload a new one at any time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLogoConfirmOpen(false)} disabled={deletingLogo}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteLogo}
            color="error"
            variant="contained"
            disabled={deletingLogo}
          >
            {deletingLogo ? <CircularProgress size={16} color="inherit" /> : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
