import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from "@mui/material";
import {
  Close,
  CloudUpload,
  Download,
  CheckCircle,
  Error as ErrorIcon,
  Info,
  PlaylistAddCheck,
} from "@mui/icons-material";
import { api } from "../api";
import { SPACING } from "../muiTheme";

// Two-step bulk import (#881): preview (dry run, nothing written) then an
// explicit confirm gated on the signed previewToken the backend returns.
// The token binds uploader + org + file bytes + TTL, and confirm re-sends
// the SAME file, so any re-selection drops the flow back to the start.
// Phases: "select" -> "preview" -> "done".
export default function BulkUploadModal({ open, onClose, onSuccess }) {
  const [phase, setPhase] = useState("select");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const resetToSelect = () => {
    setPhase("select");
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        setError("Please select a CSV file");
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError("File size must be less than 5MB");
        return;
      }
      setFile(selectedFile);
      setError("");
      setPreview(null);
      setResult(null);
      setPhase("select");
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/users/bulk-upload/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(response.data);
      setPhase("preview");
    } catch (err) {
      setError(`Preview failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !preview?.previewToken) return;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("previewToken", preview.previewToken);
      const response = await api.post("/users/bulk-upload/confirm", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(response.data);
      setPhase("done");
      if (response.data.summary.successful > 0 && onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (code && code.startsWith("PREVIEW_TOKEN")) {
        // Expired or mismatched token: the preview no longer stands. Send
        // the admin back to re-preview rather than confirming stale state.
        setError(
          `${err.response?.data?.error || "Preview expired"}. Please run the preview again.`
        );
        setPhase("select");
        setPreview(null);
      } else {
        setError(`Import failed: ${err.response?.data?.error || err.message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "username,email,password,isAdmin\njohn.doe,john.doe@example.com,SecurePass123,false\n,jane.smith@example.com,,true";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "user_upload_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (!busy) {
      resetToSelect();
      setError("");
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: "400px",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="div">
          Bulk User Upload
        </Typography>
        <IconButton onClick={handleClose} disabled={busy} size="small" aria-label="close">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Instructions */}
        {phase === "select" && (
          <Alert severity="info" icon={<Info />} sx={{ mb: SPACING.large }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: SPACING.small }}>
              Upload a CSV file to create multiple user accounts
            </Typography>
            <Typography variant="body2" component="div">
              Required columns: <strong>email</strong>
              <br />
              Optional columns: <strong>username</strong> (leave blank to auto-generate one from the
              email), <strong>password</strong> (leave blank to send a setup invite email),{" "}
              <strong>isAdmin</strong> (true/false)
              <br />
              Nothing is created until you review the preview and confirm.
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: SPACING.medium }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {/* Step 1: file selection */}
        {phase === "select" && (
          <Box>
            <Box
              sx={{
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 2,
                p: SPACING.xlarge,
                textAlign: "center",
                bgcolor: "background.default",
                mb: 2,
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: "none" }}
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<CloudUpload />}
                  disabled={busy}
                >
                  Choose CSV File
                </Button>
              </label>
              {file && (
                <Typography variant="body2" sx={{ mt: SPACING.medium, color: "text.secondary" }}>
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </Typography>
              )}
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center", mb: SPACING.medium }}>
              <Button
                variant="text"
                startIcon={<Download />}
                onClick={handleDownloadTemplate}
                size="small"
              >
                Download Template CSV
              </Button>
            </Box>
          </Box>
        )}

        {/* Step 2: dry-run preview, nothing created yet */}
        {phase === "preview" && preview && (
          <Box>
            <Alert
              severity={preview.summary.wouldCreate > 0 ? "info" : "warning"}
              icon={<PlaylistAddCheck />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                Preview only: no accounts have been created yet
              </Typography>
              <Typography variant="body2">
                {preview.summary.wouldCreate} of {preview.summary.total} rows will create accounts
                {preview.summary.wouldSkip > 0 &&
                  `; ${preview.summary.wouldSkip} will be skipped (see below)`}
                .
              </Typography>
            </Alert>

            {preview.accepted.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Will be created ({preview.accepted.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Username</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Password</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.accepted.map((row) => (
                        <TableRow key={row.row}>
                          <TableCell>{row.row}</TableCell>
                          <TableCell>
                            {row.username || (
                              <Typography
                                component="span"
                                variant="body2"
                                sx={{ fontStyle: "italic", color: "text.secondary" }}
                              >
                                (auto-generated)
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>
                            {row.isAdmin ? (
                              <Chip label="Admin" size="small" color="primary" />
                            ) : (
                              <Chip label="User" size="small" />
                            )}
                          </TableCell>
                          <TableCell>
                            {row.hasPassword ? (
                              <Chip label="From CSV" size="small" />
                            ) : (
                              <Chip label="Setup invite email" size="small" color="info" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {preview.rejected.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: "warning.main" }}>
                  Will be skipped ({preview.rejected.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Field</TableCell>
                        <TableCell>Reason</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rejected.map((rej, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{rej.row}</TableCell>
                          <TableCell>{rej.field}</TableCell>
                          <TableCell sx={{ color: "warning.main" }}>{rej.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}

        {/* Step 3: what actually happened */}
        {phase === "done" && result && (
          <Box>
            <Alert
              severity={result.summary.failed === 0 ? "success" : "warning"}
              icon={result.summary.failed === 0 ? <CheckCircle /> : <ErrorIcon />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                Import Complete
              </Typography>
              <Typography variant="body2">
                {result.summary.successful} of {result.summary.total} users created successfully
                {result.summary.failed > 0 && ` (${result.summary.failed} failed)`}
              </Typography>
            </Alert>

            {result.results.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Successfully Created ({result.results.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Username</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Admin</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.results.map((user) => (
                        <TableRow key={user.row}>
                          <TableCell>{user.row}</TableCell>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            {user.isAdmin ? (
                              <Chip label="Admin" size="small" color="primary" />
                            ) : (
                              <Chip label="User" size="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {result.errors.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: "error.main" }}>
                  Errors ({result.errors.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Field</TableCell>
                        <TableCell>Error</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{err.row}</TableCell>
                          <TableCell>{err.field}</TableCell>
                          <TableCell sx={{ color: "error.main" }}>{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {phase === "select" && (
          <>
            <Button onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handlePreview}
              disabled={!file || busy}
              startIcon={busy ? <CircularProgress size={16} /> : <PlaylistAddCheck />}
            >
              {busy ? "Checking..." : "Preview Import"}
            </Button>
          </>
        )}
        {phase === "preview" && (
          <>
            <Button onClick={resetToSelect} disabled={busy}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={busy || !preview?.previewToken}
              startIcon={busy ? <CircularProgress size={16} /> : <CloudUpload />}
            >
              {busy
                ? "Creating..."
                : `Create ${preview?.summary?.wouldCreate ?? 0} Account${
                    preview?.summary?.wouldCreate === 1 ? "" : "s"
                  }`}
            </Button>
          </>
        )}
        {phase === "done" && (
          <>
            <Button onClick={handleClose}>Close</Button>
            <Button variant="contained" onClick={resetToSelect}>
              Upload Another File
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
