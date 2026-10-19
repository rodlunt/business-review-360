import React from "react";
import { Dialog, DialogContent, DialogActions, Button, Typography, Box } from "@mui/material";

/**
 * Phase 3 Slice 5 (#851): welcome modal.
 *
 * Shown every login over a blurred backdrop of whatever the user landed on
 * (the Review Ideas board, the post-login default route). A single Continue
 * button, no dismiss-forever, no persistence (locked decision #7) -- the
 * once-per-login gating is ephemeral state in App.jsx via nextOnboardingStep.
 * Purely presentational: no API calls, no stored flag.
 */
function WelcomeModal({ orgName, onContinue }) {
  return (
    <Dialog
      open
      disableEscapeKeyDown
      aria-labelledby="welcome-modal-title"
      slotProps={{
        backdrop: {
          "data-testid": "welcome-backdrop",
          sx: { backdropFilter: "blur(6px)", backgroundColor: "rgba(0,0,0,0.35)" },
        },
      }}
    >
      <DialogContent>
        <Box sx={{ textAlign: "center", py: 2 }}>
          <Typography id="welcome-modal-title" variant="h5" fontWeight={700} gutterBottom>
            {orgName ? `Welcome to ${orgName}` : "Welcome to Business Review 360"}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Let us get you oriented. This only takes a moment.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "center", pb: 3 }}>
        <Button
          variant="contained"
          size="large"
          onClick={onContinue}
          data-testid="welcome-continue"
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default WelcomeModal;
