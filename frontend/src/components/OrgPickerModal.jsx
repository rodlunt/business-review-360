import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";

/**
 * Phase 3 Slice 4 (#851): org-picker modal.
 *
 * Shown once per login to multi-org users (the single-org skip and the
 * once-per-session gate live in App.jsx via shouldShowOrgPicker). Pre-selects
 * the user's primary org, falling back to the current session org, then the
 * first membership. No dismiss: the user must choose (locked decision #6).
 * onChoose performs an in-place org switch (auth.pickOrg) and is awaited; the
 * choice is persisted as the new primary by select-org (Slice 2a, last-wins).
 */
function OrgPickerModal({
  memberships = [],
  primaryOrganizationId = null,
  currentOrganizationId = null,
  onChoose,
}) {
  const defaultOrg = useMemo(() => {
    const ids = memberships.map((m) => m.organizationId);
    if (primaryOrganizationId && ids.includes(primaryOrganizationId)) {
      return primaryOrganizationId;
    }
    if (currentOrganizationId && ids.includes(currentOrganizationId)) {
      return currentOrganizationId;
    }
    return ids[0] ?? "";
  }, [memberships, primaryOrganizationId, currentOrganizationId]);

  const [selected, setSelected] = useState(defaultOrg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleContinue = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onChoose(selected);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not switch organisation.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      disableEscapeKeyDown
      aria-labelledby="org-picker-title"
      slotProps={{ backdrop: { "data-testid": "org-picker-backdrop" } }}
    >
      <DialogTitle id="org-picker-title">Choose an organisation</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          You belong to more than one organisation. Choose the one to work in.
        </Typography>
        <RadioGroup
          aria-label="organisation"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {memberships.map((m) => (
            <FormControlLabel
              key={m.organizationId}
              value={m.organizationId}
              control={<Radio />}
              label={m.orgName || m.organizationId}
              slotProps={{ typography: { "data-testid": `org-option-${m.organizationId}` } }}
            />
          ))}
        </RadioGroup>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} aria-live="assertive">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          onClick={handleContinue}
          disabled={!selected || busy}
          data-testid="org-picker-continue"
          startIcon={busy ? <CircularProgress size={18} /> : null}
        >
          {busy ? "Switching..." : "Continue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default OrgPickerModal;
