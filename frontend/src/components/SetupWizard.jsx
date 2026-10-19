import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import { Close, ContentCopy, CheckCircle, Add } from "@mui/icons-material";

const STEPS = ["Your organisation", "Categories", "Invite your team", "First idea", "All done!"];

// Step 0: org name + description
function OrgDetailsStep({ orgName, setOrgName, description, setDescription }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Give your organisation a name and a short description so your team knows what this space is
        for.
      </Typography>
      <TextField
        label="Organisation name"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        fullWidth
        size="small"
        inputProps={{ maxLength: 255 }}
        required
        data-testid="wizard-org-name"
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        size="small"
        multiline
        rows={2}
        inputProps={{ maxLength: 500 }}
        data-testid="wizard-org-description"
      />
    </Box>
  );
}

// Step 1: add categories
function CategoriesStep({ categories, setCategories }) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories((prev) => [...prev, trimmed]);
    setInput("");
  };

  const remove = (cat) => setCategories((prev) => prev.filter((c) => c !== cat));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Categories help your team tag ideas so they are easier to find and review. Add at least
        three.
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          label="Category name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          size="small"
          fullWidth
          inputProps={{ maxLength: 100 }}
          data-testid="wizard-category-input"
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<Add />}
          onClick={add}
          disabled={!input.trim()}
          data-testid="wizard-add-category"
        >
          Add
        </Button>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {categories.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            onDelete={() => remove(cat)}
            size="small"
            data-testid="wizard-category-chip"
          />
        ))}
      </Box>
      {categories.length > 0 && categories.length < 3 && (
        <Typography variant="caption" color="text.secondary">
          {3 - categories.length} more recommended
        </Typography>
      )}
    </Box>
  );
}

// Step 2: invite link
function InviteStep({ organizationId }) {
  const [copied, setCopied] = useState(false);
  const joinUrl = `${window.location.origin}${orgPath(organizationId, "login")}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Share this link with your team. They can sign up and start submitting ideas straight away.
      </Typography>
      <TextField
        value={joinUrl}
        size="small"
        fullWidth
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleCopy} aria-label="Copy invite link">
                {copied ? (
                  <CheckCircle fontSize="small" color="success" />
                ) : (
                  <ContentCopy fontSize="small" />
                )}
              </IconButton>
            </InputAdornment>
          ),
        }}
        data-testid="wizard-invite-url"
      />
      {copied && (
        <Typography variant="caption" color="success.main">
          Copied to clipboard!
        </Typography>
      )}
    </Box>
  );
}

// Step 3: first idea
function FirstIdeaStep({ ideaTitle, setIdeaTitle, ideaDescription, setIdeaDescription }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Lead by example. Submit your first idea and show your team what a good submission looks
        like.
      </Typography>
      <TextField
        label="Idea title"
        value={ideaTitle}
        onChange={(e) => setIdeaTitle(e.target.value)}
        fullWidth
        size="small"
        inputProps={{ maxLength: 200 }}
        data-testid="wizard-idea-title"
      />
      <TextField
        label="Describe the idea"
        value={ideaDescription}
        onChange={(e) => setIdeaDescription(e.target.value)}
        fullWidth
        size="small"
        multiline
        rows={3}
        inputProps={{ maxLength: 2000 }}
        data-testid="wizard-idea-description"
      />
    </Box>
  );
}

// Step 4: done
function DoneStep() {
  return (
    <Box sx={{ textAlign: "center", py: 2 }}>
      <CheckCircle sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        You're all set!
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Your organisation is ready to go. Share the invite link with your team and start collecting
        ideas.
      </Typography>
    </Box>
  );
}

export default function SetupWizard({ open, onClose, initialStep = 0, onComplete }) {
  const navigate = useNavigate();
  const organizationId = useOrganizationId();

  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 0 state
  const [orgName, setOrgName] = useState("");
  const [description, setDescription] = useState("");
  // Step 1 state
  const [categories, setCategories] = useState([]);
  // Step 3 state
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");

  const isLastStep = step === STEPS.length - 1;

  const saveStep = useCallback(async (targetStep, completed = false) => {
    try {
      await api.patch("/settings/setup-wizard", {
        step: targetStep,
        ...(completed ? { completed: true } : {}),
      });
    } catch {
      // Non-critical: wizard progress persistence; ignore silently
    }
  }, []);

  const handleClose = async () => {
    await saveStep(step);
    onClose();
  };

  const handleSkip = async () => {
    if (isLastStep) return;
    const next = step + 1;
    setStep(next);
    await saveStep(next);
  };

  const handleNext = async () => {
    setError("");
    setSaving(true);
    try {
      if (step === 0) {
        if (!orgName.trim()) {
          setError("Organisation name is required.");
          return;
        }
        await api.post("/settings", {
          organizationName: orgName.trim(),
          ...(description.trim() ? { organizationDescription: description.trim() } : {}),
        });
      } else if (step === 1) {
        for (const cat of categories) {
          await api.post("/categories", { name: cat });
        }
      } else if (step === 3) {
        if (ideaTitle.trim() && ideaDescription.trim()) {
          await api.post("/ideas", {
            title: ideaTitle.trim(),
            description: ideaDescription.trim(),
          });
        }
      }

      if (isLastStep) {
        await saveStep(0, true);
        onComplete?.();
        onClose();
        navigate(orgPath(organizationId, "review"));
        return;
      }

      const next = step + 1;
      setStep(next);
      await saveStep(next);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 0) return orgName.trim().length > 0;
    if (step === 3) return true; // idea is optional (skip handles empty)
    return true;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth data-testid="setup-wizard">
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
      >
        <Box>
          <Typography variant="h6">Getting started</Typography>
          <Typography variant="caption" color="text.secondary">
            Step {step + 1} of {STEPS.length}
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose} aria-label="Close wizard">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {step === 0 && (
          <OrgDetailsStep
            orgName={orgName}
            setOrgName={setOrgName}
            description={description}
            setDescription={setDescription}
          />
        )}
        {step === 1 && <CategoriesStep categories={categories} setCategories={setCategories} />}
        {step === 2 && <InviteStep organizationId={organizationId} />}
        {step === 3 && (
          <FirstIdeaStep
            ideaTitle={ideaTitle}
            setIdeaTitle={setIdeaTitle}
            ideaDescription={ideaDescription}
            setIdeaDescription={setIdeaDescription}
          />
        )}
        {step === 4 && <DoneStep />}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Box>
          {step > 0 && !isLastStep && (
            <Button size="small" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              Back
            </Button>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {!isLastStep && (
            <Button size="small" onClick={handleSkip} disabled={saving} data-testid="wizard-skip">
              Skip
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={handleNext}
            disabled={saving || !canNext()}
            data-testid="wizard-next"
          >
            {isLastStep ? "Go to dashboard" : "Next"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
