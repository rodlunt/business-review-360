import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Alert,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import EditIcon from "@mui/icons-material/Edit";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatPeriod(month, year) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function formatConfirmedAt(iso) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });
}

function prevMonth() {
  const d = new Date();
  return d.getMonth() === 0
    ? { month: 12, year: d.getFullYear() - 1 }
    : { month: d.getMonth(), year: d.getFullYear() };
}

function availableYears() {
  const cur = new Date().getFullYear();
  return [cur, cur - 1, cur - 2].filter((y) => y >= 2025);
}

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

export default function AdminConsultants() {
  const [consultants, setConsultants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stripe gross (period) per consultant, keyed by referralCode. Loaded
  // lazily from the commission preview endpoint after the main list.
  const [stripeGross, setStripeGross] = useState(null);
  const [stripeGrossLoading, setStripeGrossLoading] = useState(false);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    commissionPct: "30",
  });
  const [inviteStatus, setInviteStatus] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Edit rate dialog
  const [rateTarget, setRateTarget] = useState(null);
  const [rateInput, setRateInput] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(null);

  // Payments dialog
  const [paymentsTarget, setPaymentsTarget] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);
  const defaultPeriod = prevMonth();
  const [recordForm, setRecordForm] = useState({
    periodMonth: String(defaultPeriod.month),
    periodYear: String(defaultPeriod.year),
    amountDollars: "",
    notes: "",
  });
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState(null);
  const [recordSuccess, setRecordSuccess] = useState(false);

  const loadConsultants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/internal/consultants");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConsultants(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStripeGross = useCallback(async () => {
    setStripeGrossLoading(true);
    try {
      const res = await adminFetch("/api/internal/commission/preview");
      if (!res.ok) return;
      const data = await res.json();
      if (!data.consultants) return;
      const map = {};
      for (const c of data.consultants) {
        map[c.referralCode] = c.grossDisplay;
      }
      setStripeGross(map);
    } catch {
      // Non-critical: Stripe may not be configured in all environments.
    } finally {
      setStripeGrossLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConsultants();
    loadStripeGross();
  }, [loadConsultants]);

  const openPaymentsDialog = async (consultant) => {
    setPaymentsTarget(consultant);
    setPayments([]);
    setPaymentsError(null);
    setRecordError(null);
    setRecordSuccess(false);
    const p = prevMonth();
    setRecordForm({
      periodMonth: String(p.month),
      periodYear: String(p.year),
      amountDollars: "",
      notes: "",
    });
    setPaymentsLoading(true);
    try {
      const res = await adminFetch(`/api/internal/consultants/${consultant.id}/payments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayments(await res.json());
    } catch (err) {
      setPaymentsError(err.message);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    setRecordError(null);
    setRecordSuccess(false);
    const dollars = parseFloat(recordForm.amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      setRecordError("Enter a valid amount greater than $0.");
      return;
    }
    const amountCents = Math.round(dollars * 100);
    setRecordLoading(true);
    try {
      const res = await adminFetch(`/api/internal/consultants/${paymentsTarget.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          periodMonth: parseInt(recordForm.periodMonth),
          periodYear: parseInt(recordForm.periodYear),
          amountCents,
          notes: recordForm.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment.");
      setPayments((prev) => [data, ...prev]);
      setRecordForm((f) => ({ ...f, amountDollars: "", notes: "" }));
      setRecordSuccess(true);
    } catch (err) {
      setRecordError(err.message);
    } finally {
      setRecordLoading(false);
    }
  };

  const handleInviteChange = (e) => {
    setInviteForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleInviteSubmit = async () => {
    setInviteLoading(true);
    setInviteStatus(null);
    try {
      const pct = parseFloat(inviteForm.commissionPct);
      const res = await adminFetch("/api/internal/consultants/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteForm.email,
          firstName: inviteForm.firstName,
          lastName: inviteForm.lastName,
          commissionRate: isNaN(pct) ? 0.3 : pct / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteStatus({ ok: false, message: data.error || "Failed to send invite." });
        return;
      }
      const expires = new Date(data.expiresAt).toLocaleDateString("en-AU");
      if (data.emailSent === false) {
        setInviteStatus({
          ok: false,
          message: `Invite created but the email failed to send. Copy this link and send it manually: ${data.signupUrl} (expires ${expires}).`,
        });
      } else {
        setInviteStatus({
          ok: true,
          message: `Invite sent to ${inviteForm.email} (expires ${expires}).`,
        });
        setTimeout(() => setInviteOpen(false), 3000);
      }
      setInviteForm({ email: "", firstName: "", lastName: "", commissionPct: "30" });
      loadConsultants();
    } catch (err) {
      setInviteStatus({ ok: false, message: `Network error: ${err.message}` });
    } finally {
      setInviteLoading(false);
    }
  };

  const openRateDialog = (consultant) => {
    setRateTarget(consultant);
    setRateInput(String((consultant.commissionRate * 100).toFixed(0)));
    setRateError(null);
  };

  const handleRateSave = async () => {
    const pct = parseFloat(rateInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setRateError("Enter a value between 0 and 100.");
      return;
    }
    setRateLoading(true);
    setRateError(null);
    try {
      const res = await adminFetch(`/api/internal/consultants/${rateTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ commissionRate: pct / 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update.");
      setConsultants((prev) =>
        prev.map((c) =>
          c.id === rateTarget.id ? { ...c, commissionRate: data.commissionRate } : c
        )
      );
      setRateTarget(null);
    } catch (err) {
      setRateError(err.message);
    } finally {
      setRateLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
        <Typography variant="h5" fontWeight={600}>
          Consultants
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => {
            setInviteOpen(true);
            setInviteStatus(null);
          }}
        >
          Invite consultant
        </Button>
      </Box>

      {loading && <CircularProgress size={32} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <TableContainer component={Paper} variant="outlined">
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
                <TableCell>Name</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Referral code</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Referred orgs</TableCell>
                <TableCell align="right">Commission YTD</TableCell>
                <TableCell align="right">
                  Stripe gross (period)
                  {stripeGrossLoading && <CircularProgress size={10} sx={{ ml: 0.5 }} />}
                </TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {consultants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No consultants yet.
                  </TableCell>
                </TableRow>
              )}
              {consultants.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>{`${c.firstName} ${c.lastName}`.trim()}</TableCell>
                  <TableCell>{c.companyName || ""}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {c.referralCode}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 0.5,
                      }}
                    >
                      {(c.commissionRate * 100).toFixed(0)}%
                      <Tooltip title="Edit commission rate">
                        <IconButton size="small" onClick={() => openRateDialog(c)} sx={{ ml: 0.5 }}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{c.referredOrgCount}</TableCell>
                  <TableCell align="right">{c.commissionYtdDisplay}</TableCell>
                  <TableCell align="right" sx={{ color: "text.secondary" }}>
                    {stripeGross === null
                      ? stripeGrossLoading
                        ? "…"
                        : "—"
                      : (stripeGross[c.referralCode] ?? "—")}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={c.isActive ? "Active" : "Inactive"}
                      color={c.isActive ? "success" : "default"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Payment log">
                      <IconButton size="small" onClick={() => openPaymentsDialog(c)}>
                        <ReceiptLongIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invite consultant</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {inviteStatus && (
            <Alert severity={inviteStatus.ok ? "success" : "error"} sx={{ mb: 2 }}>
              {inviteStatus.message}
            </Alert>
          )}
          <TextField
            label="Email"
            name="email"
            type="email"
            value={inviteForm.email}
            onChange={handleInviteChange}
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="First name"
            name="firstName"
            value={inviteForm.firstName}
            onChange={handleInviteChange}
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="Last name"
            name="lastName"
            value={inviteForm.lastName}
            onChange={handleInviteChange}
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="Commission rate"
            name="commissionPct"
            type="number"
            value={inviteForm.commissionPct}
            onChange={handleInviteChange}
            fullWidth
            required
            inputProps={{ min: 0, max: 100, step: 1 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            helperText="Percentage of each referred client's subscription paid monthly."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleInviteSubmit}
            disabled={
              inviteLoading || !inviteForm.email || !inviteForm.firstName || !inviteForm.lastName
            }
          >
            {inviteLoading ? <CircularProgress size={18} /> : "Send invite"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit commission rate dialog */}
      <Dialog
        open={Boolean(rateTarget)}
        onClose={() => setRateTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Edit commission rate</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {rateTarget ? `${rateTarget.firstName} ${rateTarget.lastName}`.trim() : ""}
          </Typography>
          {rateError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rateError}
            </Alert>
          )}
          <TextField
            label="Commission rate"
            type="number"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            fullWidth
            inputProps={{ min: 0, max: 100, step: 1 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            helperText="Percentage of each referred client's subscription paid to the consultant."
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRateTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleRateSave} disabled={rateLoading}>
            {rateLoading ? <CircularProgress size={18} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment log dialog */}
      <Dialog
        open={Boolean(paymentsTarget)}
        onClose={() => setPaymentsTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Payment log
          {paymentsTarget && (
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {`${paymentsTarget.firstName} ${paymentsTarget.lastName}`.trim()}
              {paymentsTarget.companyName ? ` — ${paymentsTarget.companyName}` : ""}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {paymentsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {paymentsError}
            </Alert>
          )}

          {/* Record payment form */}
          <Typography variant="subtitle2" fontWeight={600} mb={1.5}>
            Record a payment
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
            <TextField
              select
              label="Month"
              value={recordForm.periodMonth}
              onChange={(e) => setRecordForm((f) => ({ ...f, periodMonth: e.target.value }))}
              sx={{ minWidth: 130 }}
              size="small"
            >
              {MONTH_NAMES.map((name, i) => (
                <MenuItem key={i + 1} value={String(i + 1)}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Year"
              value={recordForm.periodYear}
              onChange={(e) => setRecordForm((f) => ({ ...f, periodYear: e.target.value }))}
              sx={{ minWidth: 90 }}
              size="small"
            >
              {availableYears().map((y) => (
                <MenuItem key={y} value={String(y)}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount paid"
              type="number"
              value={recordForm.amountDollars}
              onChange={(e) => setRecordForm((f) => ({ ...f, amountDollars: e.target.value }))}
              inputProps={{ min: 0.01, step: 0.01 }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ minWidth: 130 }}
              size="small"
            />
          </Box>
          <TextField
            label="Notes (optional)"
            value={recordForm.notes}
            onChange={(e) => setRecordForm((f) => ({ ...f, notes: e.target.value }))}
            fullWidth
            size="small"
            sx={{ mb: 1.5 }}
            placeholder="e.g. invoice ref, bank ref"
          />
          {recordError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {recordError}
            </Alert>
          )}
          {recordSuccess && (
            <Alert severity="success" sx={{ mb: 1.5 }}>
              Payment recorded.
            </Alert>
          )}
          <Button
            variant="contained"
            onClick={handleRecordPayment}
            disabled={recordLoading || !recordForm.amountDollars}
            size="small"
          >
            {recordLoading ? <CircularProgress size={16} /> : "Confirm payment"}
          </Button>

          <Divider sx={{ my: 3 }} />

          {/* Payment history */}
          <Typography variant="subtitle2" fontWeight={600} mb={1.5}>
            Payment history
          </Typography>
          {paymentsLoading && <CircularProgress size={24} />}
          {!paymentsLoading && payments.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No payments recorded yet.
            </Typography>
          )}
          {!paymentsLoading && payments.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Amount
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Confirmed</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatPeriod(p.periodMonth, p.periodYear)}</TableCell>
                    <TableCell align="right">${(p.amountCents / 100).toFixed(2)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatConfirmedAt(p.confirmedAt)}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                      {p.notes || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPaymentsTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
