import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  FormControlLabel,
  Paper,
  Divider,
} from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";

/**
 * ConsultantsPanel
 *
 * Superuser-only section within AdminSettings for managing consultant invites.
 * Renders:
 *   1. An invite form (first name, last name, email)
 *   2. A table of existing consultants with inline commission-rate and
 *      active-toggle controls
 *
 * Issue #808 Phase 1.
 */
export default function ConsultantsPanel() {
  // Invite form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError] = useState("");

  // Consultant list state
  const [consultants, setConsultants] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  // Per-row update state: { [id]: { loading, error } }
  const [rowState, setRowState] = useState({});

  const fetchConsultants = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await api.get("/consultants");
      setConsultants(res.data);
    } catch (err) {
      setListError(err.response?.data?.error || "Failed to load consultants.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsultants();
  }, [fetchConsultants]);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    setInviteLoading(true);
    try {
      const res = await api.post("/consultants/invite", { email, firstName, lastName });
      setInviteSuccess(
        `Invite sent to ${res.data.email}. Token expires ${new Date(res.data.expiresAt).toLocaleDateString()}.`
      );
      setFirstName("");
      setLastName("");
      setEmail("");
    } catch (err) {
      const details = err.response?.data?.details;
      const message = details
        ? details.map((d) => d.message).join(", ")
        : err.response?.data?.error || "Failed to send invite.";
      setInviteError(message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateConsultant = async (id, updates) => {
    setRowState((prev) => ({ ...prev, [id]: { loading: true, error: "" } }));
    try {
      const res = await api.patch(`/consultants/${id}`, updates);
      setConsultants((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, commissionRate: res.data.commissionRate, isActive: res.data.isActive }
            : c
        )
      );
      setRowState((prev) => ({ ...prev, [id]: { loading: false, error: "" } }));
    } catch (err) {
      const message = err.response?.data?.error || "Update failed.";
      setRowState((prev) => ({ ...prev, [id]: { loading: false, error: message } }));
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
          Consultants
        </Typography>

        {/* Invite form */}
        <Box component="form" onSubmit={handleSendInvite} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1.5 }}>
            Send an invite
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              size="small"
            />
            <TextField
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              size="small"
            />
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              size="small"
              sx={{ gridColumn: { sm: "span 2" } }}
            />
          </Box>

          {inviteSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInviteSuccess("")}>
              {inviteSuccess}
            </Alert>
          )}
          {inviteError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setInviteError("")}>
              {inviteError}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            startIcon={
              inviteLoading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />
            }
            disabled={inviteLoading}
          >
            Send invite
          </Button>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Consultant list */}
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1.5 }}>
          Registered consultants
        </Typography>

        {listLoading && <CircularProgress size={24} />}
        {listError && <Alert severity="error">{listError}</Alert>}

        {!listLoading && !listError && consultants.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No consultants registered yet.
          </Typography>
        )}

        {!listLoading && consultants.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell>Referral code</TableCell>
                  <TableCell>Commission</TableCell>
                  <TableCell>Active</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consultants.map((c) => {
                  const row = rowState[c.id] || { loading: false, error: "" };
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.firstName} {c.lastName}
                      </TableCell>
                      <TableCell>{c.companyName || "—"}</TableCell>
                      <TableCell>
                        <code>{c.referralCode}</code>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <TextField
                            type="number"
                            size="small"
                            defaultValue={(parseFloat(c.commissionRate) * 100).toFixed(0)}
                            inputProps={{ min: 0, max: 100, step: 1 }}
                            sx={{ width: 72 }}
                            onBlur={(e) => {
                              const pct = parseFloat(e.target.value);
                              if (!isNaN(pct)) {
                                handleUpdateConsultant(c.id, { commissionRate: pct / 100 });
                              }
                            }}
                          />
                          <Typography variant="body2">%</Typography>
                          {row.loading && <CircularProgress size={14} />}
                        </Box>
                        {row.error && (
                          <Typography variant="caption" color="error">
                            {row.error}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={c.isActive}
                              size="small"
                              onChange={(e) =>
                                handleUpdateConsultant(c.id, { isActive: e.target.checked })
                              }
                              disabled={row.loading}
                            />
                          }
                          label=""
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
