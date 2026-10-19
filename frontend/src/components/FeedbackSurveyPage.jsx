import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { api } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";

function StarRating({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(null);
  const active = hovered ?? value;

  return (
    <Stack direction="row" spacing={0.5} justifyContent="center">
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          sx={{
            background: "none",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            p: 0.5,
            color: n <= active ? "warning.main" : "action.disabled",
            fontSize: 40,
            display: "flex",
            transition: "color 0.1s",
          }}
        >
          {n <= active ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
        </Box>
      ))}
    </Stack>
  );
}

const LABELS = {
  1: "Very dissatisfied",
  2: "Dissatisfied",
  3: "Neutral",
  4: "Satisfied",
  5: "Very satisfied",
};

export default function FeedbackSurveyPage() {
  usePageTitle("Share your feedback");

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [rating, setRating] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">
          This survey link is invalid. Please use the link from your email.
        </Alert>
      </Container>
    );
  }

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/surveys/submit", {
        token,
        rating,
        feedback: feedback.trim() || undefined,
        isAnonymous,
      });
      setDone(true);
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg === "Token has expired") {
        setError("This survey link has expired. Survey links are valid for 30 days.");
      } else if (msg === "Invalid token") {
        setError("This survey link is not valid.");
      } else {
        setError("Something went wrong submitting your feedback. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Container maxWidth="sm" sx={{ py: 10 }}>
        <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
          <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
          <Typography variant="h5" fontWeight={700} mb={1}>
            Thank you for your feedback
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Your response has been recorded. We read every piece of feedback and use it to improve
            Business Review 360.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Typography variant="h5" fontWeight={700} mb={0.5} textAlign="center">
          How are we doing?
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" mb={4}>
          Your feedback helps us improve Business Review 360 for everyone.
        </Typography>

        <Typography variant="subtitle2" fontWeight={600} mb={1.5} textAlign="center">
          How satisfied are you with Business Review 360?
        </Typography>

        <StarRating value={rating} onChange={setRating} disabled={submitting} />

        {rating && (
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center"
            mt={0.5}
            mb={3}
            sx={{ minHeight: 24 }}
          >
            {LABELS[rating]}
          </Typography>
        )}

        {!rating && <Box mb={3} />}

        <TextField
          label="Anything you'd like to add? (optional)"
          multiline
          rows={4}
          fullWidth
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={submitting}
          sx={{ mb: 2 }}
          inputProps={{ maxLength: 2000 }}
        />

        <FormControlLabel
          control={
            <Switch
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              disabled={submitting}
              size="small"
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Submit anonymously
            </Typography>
          }
          sx={{ mb: 3, display: "flex" }}
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={handleSubmit}
          disabled={!rating || submitting}
        >
          {submitting ? <CircularProgress size={22} color="inherit" /> : "Submit feedback"}
        </Button>
      </Paper>
    </Container>
  );
}
