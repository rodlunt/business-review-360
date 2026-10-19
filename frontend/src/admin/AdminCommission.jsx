import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

function adminFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

export default function AdminCommission() {
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await adminFetch("/api/internal/commission/preview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.warning) throw new Error(data.warning);
      setPreview(data.consultants);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runCommission = async () => {
    if (
      !window.confirm(
        "Run the commission job now? This creates CommissionRun records and sends payout emails."
      )
    )
      return;
    setRunLoading(true);
    setRunStatus(null);
    try {
      const res = await adminFetch("/api/internal/commission/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger run.");
      const time = new Date(data.triggeredAt).toLocaleString("en-AU");
      setRunStatus({
        ok: true,
        message: `Job triggered at ${time}. Check server logs for results.`,
      });
    } catch (err) {
      setRunStatus({ ok: false, message: err.message });
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={4}>
        Commission
      </Typography>

      <Typography variant="h6" fontWeight={600} mb={1}>
        Period preview
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Estimates commissions owed for the current period based on active Stripe subscriptions.
      </Typography>

      <Button variant="outlined" onClick={loadPreview} disabled={previewLoading} sx={{ mb: 2.5 }}>
        {previewLoading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
        Load preview
      </Button>

      {previewError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {previewError}
        </Alert>
      )}

      {preview && (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    fontWeight: 700,
                    backgroundColor: "primary.main",
                    color: "primary.contrastText",
                  },
                }}
              >
                <TableCell />
                <TableCell>Consultant</TableCell>
                <TableCell>Code</TableCell>
                <TableCell align="right">Referred orgs</TableCell>
                <TableCell align="right">Gross (period)</TableCell>
                <TableCell align="right">Commission</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No active consultants with revenue this period.
                  </TableCell>
                </TableRow>
              )}
              {preview.map((c) => (
                <>
                  <TableRow
                    key={c.consultantId}
                    hover
                    onClick={() =>
                      setExpandedRow(expandedRow === c.consultantId ? null : c.consultantId)
                    }
                    sx={{ cursor: c.orgs.length > 0 ? "pointer" : "default" }}
                  >
                    <TableCell sx={{ width: 32 }}>
                      {c.orgs.length > 0 && (
                        <ExpandMoreIcon
                          fontSize="small"
                          sx={{
                            transform: expandedRow === c.consultantId ? "rotate(180deg)" : "none",
                            transition: "transform 0.2s",
                            color: "text.secondary",
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {c.referralCode}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{c.orgs.length}</TableCell>
                    <TableCell align="right">{c.grossDisplay}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {c.commissionDisplay}
                    </TableCell>
                  </TableRow>
                  {expandedRow === c.consultantId &&
                    c.orgs.map((o) => (
                      <TableRow key={o.orgName} sx={{ backgroundColor: "grey.50" }}>
                        <TableCell />
                        <TableCell
                          colSpan={3}
                          sx={{ pl: 4, color: "text.secondary", fontSize: "0.8125rem" }}
                        >
                          {o.orgName}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontSize: "0.8125rem", color: "text.secondary" }}
                        >
                          ${(o.grossCents / 100).toFixed(2)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                </>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Divider sx={{ my: 5 }} />

      <Typography variant="h6" fontWeight={600} mb={1}>
        Run commission job
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Triggers the monthly commission job immediately. Use for corrections or testing.
      </Typography>

      {runStatus && (
        <Alert severity={runStatus.ok ? "success" : "error"} sx={{ mb: 2 }}>
          {runStatus.message}
        </Alert>
      )}

      <Button
        variant="contained"
        color="error"
        startIcon={<PlayArrowIcon />}
        onClick={runCommission}
        disabled={runLoading}
      >
        {runLoading ? <CircularProgress size={18} sx={{ mr: 1 }} color="inherit" /> : null}
        Run commission now
      </Button>
    </Box>
  );
}
