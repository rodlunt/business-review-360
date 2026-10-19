import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { LockOutlined, CheckCircleOutlined } from "@mui/icons-material";

const PLAN_FEATURES = [
  "Keep all your existing ideas, categories, and settings",
  "Restore full write access immediately on upgrade",
  "Invite your whole team",
  "Analytics and priority matrix",
];

/**
 * TrialExpiredOverlay
 *
 * Full-screen modal shown when the tenant's trial has expired.
 * Blocks interaction and directs the user to the pricing page.
 */
function TrialExpiredOverlay({ open }) {
  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ textAlign: "center", pt: 4 }}>
        <LockOutlined
          sx={{ fontSize: 48, color: "error.main", mb: 1, display: "block", mx: "auto" }}
        />
        <Typography variant="h5" fontWeight={700} component="span">
          Your free trial has ended
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Your 14-day free trial has expired. Your data is safe and waiting for you. Upgrade to
          restore full access in under two minutes.
        </Typography>

        <List dense>
          {PLAN_FEATURES.map((f) => (
            <ListItem key={f} sx={{ px: 0 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <CheckCircleOutlined fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText primary={f} primaryTypographyProps={{ variant: "body2" }} />
            </ListItem>
          ))}
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, flexDirection: "column", gap: 1 }}>
        <Button variant="contained" size="large" fullWidth href="/pricing" sx={{ fontWeight: 700 }}>
          View plans and upgrade
        </Button>
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Questions? Email{" "}
          <Box component="a" href="mailto:hello@br360.example.com" sx={{ color: "inherit" }}>
            hello@br360.example.com
          </Box>
        </Typography>
      </DialogActions>
    </Dialog>
  );
}

export default TrialExpiredOverlay;
