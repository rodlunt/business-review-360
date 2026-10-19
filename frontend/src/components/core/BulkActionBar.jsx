import React, { useState } from "react";
import { Box, Paper, Typography, Button, Menu, MenuItem, Divider } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";

const STATUS_OPTIONS = [
  "Reviewing",
  "In Progress",
  "Approved",
  "Complete",
  "Rejected",
  "Duplicate",
  "Hidden",
  "Open",
];

export default function BulkActionBar({
  selectionCount,
  busy = false,
  onSetStatus,
  onSetPinned,
  onClear,
}) {
  const [statusAnchor, setStatusAnchor] = useState(null);

  if (selectionCount <= 0) return null;

  return (
    <Paper
      elevation={6}
      role="region"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
      sx={{
        position: "fixed",
        bottom: { xs: 16, sm: 24 },
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: (theme) => theme.zIndex.appBar - 1,
        px: 2,
        py: 1,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        borderRadius: 2,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        maxWidth: "calc(100vw - 32px)",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CheckCircleIcon color="primary" fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {selectionCount} selected
        </Typography>
      </Box>
      <Divider orientation="vertical" flexItem />
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={(e) => setStatusAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(statusAnchor)}
      >
        Set status
      </Button>
      <Menu
        anchorEl={statusAnchor}
        open={Boolean(statusAnchor)}
        onClose={() => setStatusAnchor(null)}
      >
        {STATUS_OPTIONS.map((status) => (
          <MenuItem
            key={status}
            onClick={() => {
              setStatusAnchor(null);
              onSetStatus?.(status);
            }}
          >
            {status}
          </MenuItem>
        ))}
      </Menu>
      <Button size="small" variant="outlined" disabled={busy} onClick={() => onSetPinned?.(true)}>
        Pin
      </Button>
      <Button size="small" variant="outlined" disabled={busy} onClick={() => onSetPinned?.(false)}>
        Unpin
      </Button>
      <Divider orientation="vertical" flexItem />
      <Button size="small" startIcon={<CloseIcon />} onClick={onClear} disabled={busy}>
        Clear
      </Button>
    </Paper>
  );
}
