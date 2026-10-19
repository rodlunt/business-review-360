import React, { useState } from "react";
import IdeaForm from "./IdeaForm";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { usePageTitle } from "../hooks/usePageTitle";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";

export default function SubmitIdea({ onNavigate }) {
  // SECURITY: Validate user can only access their own org
  useOrgAccessGuard();
  // Issue #626: page-owned document.title.
  usePageTitle("Submit Idea");

  const [showSuccessOptions, setShowSuccessOptions] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleIdeaCreated = () => {
    setShowSuccessOptions(true);
  };

  const handleNavigateToReview = () => {
    setShowSuccessOptions(false);
    onNavigate && onNavigate("review");
  };

  const handleSubmitAnother = () => {
    setShowSuccessOptions(false);
    setFormKey((k) => k + 1);
  };

  return (
    <Container
      maxWidth="sm"
      component="main"
      sx={{ pt: { xs: 3, sm: 4 }, pb: { xs: 2, sm: 2 }, px: { xs: 2, sm: 3 } }}
    >
      <Box mb={{ xs: 1.5, sm: 3 }} textAlign="center">
        <Typography
          variant="h1"
          component="h1"
          sx={{
            color: "text.primary",
            mb: { xs: 1.5, sm: 2 },
          }}
        >
          Submit an Idea
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            color: "text.secondary",
            mb: { xs: 0.5, sm: 2 },
          }}
        >
          Help us improve by sharing your thoughts
        </Typography>
      </Box>
      <IdeaForm key={formKey} onIdeaCreated={handleIdeaCreated} />
      <Dialog
        open={showSuccessOptions}
        onClose={handleSubmitAnother}
        aria-labelledby="idea-submitted-title"
        aria-modal="true"
      >
        <DialogTitle id="idea-submitted-title">Idea Submitted!</DialogTitle>
        <DialogContent>
          <Typography variant="body1" color="text.secondary" mb={2}>
            Your idea has been submitted and is now available for review by the team. What would you
            like to do next?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleSubmitAnother} autoFocus>
            Submit Another
          </Button>
          <Button variant="contained" onClick={handleNavigateToReview} color="primary">
            Go to Review
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
