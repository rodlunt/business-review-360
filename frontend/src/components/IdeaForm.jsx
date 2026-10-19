import React, { useState, useEffect, useContext } from "react";
import { api } from "../api";
import {
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Typography,
  Box,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Autocomplete,
  Paper,
  Popper,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Checkbox,
  Slider,
} from "@mui/material";
import { ThemeContext } from "../contexts";
import FormattingTextField from "./FormattingTextField";
import { validateProfanity } from "../utils/textValidation";
import { CARD_SHADOW, SPACING } from "../muiTheme";

export default function IdeaForm({ onIdeaCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [orgImpact, setOrgImpact] = useState("");
  const [fixImpact, setFixImpact] = useState("");
  const [solution, setSolution] = useState("");
  const [timeSavedMinutes, setTimeSavedMinutes] = useState("");
  const [frequencyCount, setFrequencyCount] = useState("");
  const [frequencyPeriod, setFrequencyPeriod] = useState("");
  const [impactScore, setImpactScore] = useState(0); // 1-10 scale, default 0 (unset)
  const [effortScore, setEffortScore] = useState(0); // 1-10 scale, default 0 (unset)
  const [wouldSpendOwnMoney, setWouldSpendOwnMoney] = useState(null); // null means no selection made
  const [additionalComments, setAdditionalComments] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [categories, setCategories] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState({});
  const theme = useContext(ThemeContext);

  // Helper function to darken a hex colour by a percentage
  const darkenColor = (hex, percent) => {
    // Remove # if present
    hex = hex.replace("#", "");

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Darken each component
    const darkenedR = Math.floor(r * (1 - percent / 100));
    const darkenedG = Math.floor(g * (1 - percent / 100));
    const darkenedB = Math.floor(b * (1 - percent / 100));

    // Convert back to hex
    const toHex = (c) => {
      const hex = c.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(darkenedR)}${toHex(darkenedG)}${toHex(darkenedB)}`;
  };

  // Get primary colour from theme settings (fallback to default blue)
  const primaryColor = settings?.primaryColor || theme?.primaryColor || "#1976d2";
  const darkenedPrimaryColor = darkenColor(primaryColor, 10);

  // Auto-dismiss success and error alerts after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch dynamic categories from database
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        console.log("[IdeaForm] Fetching categories...");
        const res = await api.get("/categories");
        console.log("[IdeaForm] Categories response:", res);
        const fetchedCats = Array.isArray(res.data) ? res.data : [];
        // Extract just the names and sort them
        const categoryNames = fetchedCats.map((cat) => cat.name).sort();
        console.log(
          "[IdeaForm] Successfully fetched",
          categoryNames.length,
          "categories:",
          categoryNames
        );
        setDynamicCategories(categoryNames);
        setCategories(categoryNames);
      } catch (error) {
        console.error("[IdeaForm] Failed to fetch categories:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        // Set empty categories on failure but don't break the form
        setCategories([]);
        setDynamicCategories([]);
      }
    };

    // Add a small delay to ensure auth token is likely set
    const timer = setTimeout(fetchCategories, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Issue #546: bare /settings is deprecated. Require a resolved orgId.
    const fetchSettings = async () => {
      try {
        const orgId = localStorage.getItem("organizationId");
        if (!orgId) return;
        const res = await api.get(`/settings/organization/${orgId}/public`, {
          skipOrganizationId: true,
        });
        setSettings(res.data);
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent rapid submissions

    setError("");
    setSuccess("");
    setIsSubmitting(true);

    // Validate individual fields
    if (!title.trim()) {
      setError("Title is required");
      setIsSubmitting(false);
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      setIsSubmitting(false);
      return;
    }
    if (!category.trim()) {
      setError("Category is required");
      setIsSubmitting(false);
      return;
    }

    // Profanity filter validation
    const titleProfanity = validateProfanity(title);
    if (!titleProfanity.isValid) {
      setError(titleProfanity.error);
      setIsSubmitting(false);
      return;
    }

    const descriptionProfanity = validateProfanity(description);
    if (!descriptionProfanity.isValid) {
      setError(descriptionProfanity.error);
      setIsSubmitting(false);
      return;
    }

    const solutionProfanity = validateProfanity(solution);
    if (!solutionProfanity.isValid) {
      setError(solutionProfanity.error);
      setIsSubmitting(false);
      return;
    }

    const commentsProfanity = validateProfanity(additionalComments);
    if (!commentsProfanity.isValid) {
      setError(commentsProfanity.error);
      setIsSubmitting(false);
      return;
    }
    if (!orgImpact) {
      setError("Organisational impact is required");
      setIsSubmitting(false);
      return;
    }
    if (!fixImpact) {
      setError("Fix impact is required");
      setIsSubmitting(false);
      return;
    }
    if (!solution.trim()) {
      setError("Solution is required");
      setIsSubmitting(false);
      return;
    }
    // Validate impact/effort scores (1-10 required)
    if (impactScore === 0 || impactScore < 1 || impactScore > 10) {
      setError("Impact score is required (1-10)");
      setIsSubmitting(false);
      return;
    }
    if (effortScore === 0 || effortScore < 1 || effortScore > 10) {
      setError("Effort score is required (1-10)");
      setIsSubmitting(false);
      return;
    }
    if (wouldSpendOwnMoney === null) {
      setError(
        "Please make a selection for 'If it were your business, would you spend your own money on it?'"
      );
      setIsSubmitting(false);
      return;
    }
    try {
      // Auto-create category if it doesn't exist in database
      const categoryExists = categories.includes(category);
      if (!categoryExists && category.trim()) {
        try {
          await api.post("/categories", { name: category });
          // Refresh categories list
          const categoriesRes = await api.get("/categories");
          const fetchedCats = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
          setDynamicCategories(fetchedCats.map((cat) => cat.name));
        } catch (catError) {
          console.error("Category creation warning:", catError);
          // Continue even if category creation fails - idea can still be created
        }
      }

      const ideaData = {
        title,
        description,
        category,
        wouldSpendOwnMoney: wouldSpendOwnMoney === true, // convert to boolean
        isPrivate,
        orgImpact,
        fixImpact,
        solution,
        timeSavedMinutes: timeSavedMinutes ? parseInt(timeSavedMinutes, 10) : null,
        frequencyCount: frequencyCount ? parseInt(frequencyCount, 10) : null,
        frequencyPeriod: frequencyPeriod || null,
        impactScore,
        effortScore,
        additionalComments,
      };

      const res = await api.post("/ideas", ideaData);
      if (onIdeaCreated) onIdeaCreated(res.data);
      // Reset all fields after submit
      setTitle("");
      setDescription("");
      setCategory("");
      setOrgImpact("");
      setSolution("");
      setFixImpact("");
      setTimeSavedMinutes("");
      setFrequencyCount("");
      setFrequencyPeriod("");
      setImpactScore(0);
      setEffortScore(0);
      setWouldSpendOwnMoney(null);
      setAdditionalComments("");
      setIsPrivate(false);
      setSuccess("Idea submitted successfully!");
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to submit idea.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", mt: SPACING.medium }}>
      <Card elevation={0} sx={{ boxShadow: CARD_SHADOW }} aria-label="Idea submission form">
        <CardContent>
          <Typography
            variant="h6"
            component="h2"
            sx={{
              mb: SPACING.large,
              color: "text.primary",
              fontWeight: 600,
            }}
          >
            Share your innovative idea
          </Typography>

          {/* Display Big Question if set */}
          {settings.bigQuestion && settings.bigQuestion.trim() !== "" && (
            <Box
              sx={{
                mb: SPACING.large,
                p: SPACING.medium,
                backgroundColor: "primary.lighter",
                borderLeft: 4,
                borderColor: "primary.main",
                borderRadius: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: "primary.main",
                  mb: 0.5,
                }}
              >
                Here's the big idea:
              </Typography>
              <Typography variant="body2" sx={{ color: "text.primary" }}>
                {settings.bigQuestion}
              </Typography>
            </Box>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: "flex", flexDirection: "column", gap: SPACING.large }}
            data-testid="idea-form"
          >
            <FormattingTextField
              label="Title"
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a short, descriptive title"
              fieldType="title"
              required
              fullWidth
              data-testid="idea-title"
            />
            <Autocomplete
              freeSolo
              openOnFocus
              options={categories}
              value={category}
              onInputChange={(e, newValue) => setCategory(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Category"
                  placeholder="Select or enter a category"
                  required
                  fullWidth
                  data-testid="idea-category"
                  sx={{
                    "& .MuiInputBase-root": {
                      minHeight: "48px", // Ensure touch-friendly height
                    },
                    "& .MuiInputBase-input": {
                      minHeight: "1.4375em",
                    },
                  }}
                />
              )}
            />

            <FormattingTextField
              label="Outline of Issue"
              id="outline"
              name="outline"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail"
              fieldType="description"
              required
              fullWidth
              multiline
              minRows={2}
              data-testid="idea-description"
            />
            <TextField
              label="Impact of Issue"
              value={orgImpact}
              onChange={(e) => setOrgImpact(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
              placeholder="What is this problem doing to the organisation?"
              data-testid="organizational-impact"
            />
            <FormControl fullWidth required>
              <InputLabel id="fix-impact-label">Impact of Fixing Issue</InputLabel>
              <Select
                labelId="fix-impact-label"
                id="fix-impact"
                value={fixImpact}
                label="Impact of Fixing Issue"
                onChange={(e) => setFixImpact(e.target.value)}
                data-testid="fix-impact"
                sx={{
                  minHeight: "48px",
                }}
              >
                <MenuItem value="Low">Low</MenuItem>
                <MenuItem value="Medium">Medium</MenuItem>
                <MenuItem value="High">High</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Time Saved Per Instance (minutes)"
              id="timeSavedMinutes"
              name="timeSavedMinutes"
              type="number"
              value={timeSavedMinutes}
              onChange={(e) => setTimeSavedMinutes(e.target.value)}
              placeholder="e.g., 15"
              helperText="Optional - Estimate time saved each time this issue occurs (in minutes)"
              inputProps={{ min: 0, step: 1 }}
              fullWidth
              data-testid="time-saved-minutes"
              sx={{
                "& .MuiInputBase-root": {
                  minHeight: "48px",
                },
              }}
            />

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Frequency"
                id="frequencyCount"
                name="frequencyCount"
                type="number"
                value={frequencyCount}
                onChange={(e) => setFrequencyCount(e.target.value)}
                placeholder="e.g., 10"
                helperText="How many times does this occur?"
                inputProps={{ min: 1, step: 1 }}
                sx={{
                  flex: 1,
                  "& .MuiInputBase-root": {
                    minHeight: "48px",
                  },
                }}
                data-testid="frequency-count"
              />

              <FormControl sx={{ flex: 1 }}>
                <InputLabel id="frequency-period-label">Per</InputLabel>
                <Select
                  labelId="frequency-period-label"
                  id="frequencyPeriod"
                  value={frequencyPeriod}
                  label="Per"
                  onChange={(e) => setFrequencyPeriod(e.target.value)}
                  data-testid="frequency-period"
                  sx={{
                    minHeight: "48px",
                  }}
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="day">Per Day</MenuItem>
                  <MenuItem value="week">Per Week</MenuItem>
                  <MenuItem value="month">Per Month</MenuItem>
                  <MenuItem value="year">Per Year</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ mt: SPACING.medium }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: "text.primary" }}>
                Impact Score *
              </Typography>
              <Typography
                variant="caption"
                sx={{ mb: 2, display: "block", color: "text.secondary" }}
              >
                How much value would this idea bring to the organisation? (1 = Low, 10 = High)
              </Typography>
              <Slider
                value={impactScore}
                onChange={(e, newValue) => setImpactScore(newValue)}
                aria-label="Impact Score"
                valueLabelDisplay="auto"
                step={1}
                marks
                min={0}
                max={10}
                data-testid="impact-score-slider"
                sx={{
                  "& .MuiSlider-markLabel": {
                    fontSize: "0.75rem",
                  },
                  "& .MuiSlider-mark": {
                    backgroundColor: darkenedPrimaryColor,
                  },
                  "& .MuiSlider-thumb": {
                    backgroundColor: impactScore === 0 ? "#ff9800" : undefined,
                  },
                }}
              />
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: SPACING.micro }}>
                <Typography variant="caption" color="text.secondary">
                  Not Set
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  High Impact
                </Typography>
              </Box>
              {impactScore === 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: "error.main", fontWeight: 700, display: "block", mt: SPACING.micro }}
                >
                  Please set an impact score (required)
                </Typography>
              )}
            </Box>

            <Box sx={{ mt: SPACING.medium }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: "text.primary" }}>
                Effort Score *
              </Typography>
              <Typography
                variant="caption"
                sx={{ mb: 2, display: "block", color: "text.secondary" }}
              >
                How much work would it take to implement this idea? (1 = Easy, 10 = Very Difficult)
              </Typography>
              <Slider
                value={effortScore}
                onChange={(e, newValue) => setEffortScore(newValue)}
                aria-label="Effort Score"
                valueLabelDisplay="auto"
                step={1}
                marks
                min={0}
                max={10}
                data-testid="effort-score-slider"
                sx={{
                  "& .MuiSlider-markLabel": {
                    fontSize: "0.75rem",
                  },
                  "& .MuiSlider-mark": {
                    backgroundColor: darkenedPrimaryColor,
                  },
                  "& .MuiSlider-thumb": {
                    backgroundColor: effortScore === 0 ? "#ff9800" : undefined,
                  },
                }}
              />
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: SPACING.micro }}>
                <Typography variant="caption" color="text.secondary">
                  Not Set
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Very Difficult
                </Typography>
              </Box>
              {effortScore === 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: "error.main", fontWeight: 700, display: "block", mt: SPACING.micro }}
                >
                  Please set an effort score (required)
                </Typography>
              )}
            </Box>

            <FormattingTextField
              label="Proposed Solutions"
              id="solution"
              name="solution"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="Describe your suggested solution(s)"
              fieldType="description"
              required
              fullWidth
              multiline
              minRows={2}
              data-testid="solution"
            />
            <Box>
              <FormLabel
                component="legend"
                aria-label="If it were your business, would you spend your own money on it?"
              >
                If it were your business, would you spend your own money on it?
              </FormLabel>
              <RadioGroup
                row
                name="wouldSpendOwnMoney"
                aria-label="If it were your business, would you spend your own money on it?"
                value={wouldSpendOwnMoney === null ? "" : wouldSpendOwnMoney ? "true" : "false"}
                onChange={(e) => setWouldSpendOwnMoney(e.target.value === "true")}
                data-testid="would-spend-money"
              >
                <FormControlLabel value="true" control={<Radio />} label="Yes" />
                <FormControlLabel value="false" control={<Radio />} label="No" />
              </RadioGroup>
            </Box>
            <FormattingTextField
              label="Additional Comments"
              id="additionalComments"
              name="additionalComments"
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              placeholder="Any other relevant information (optional)"
              fieldType="comment"
              fullWidth
              multiline
              minRows={2}
              data-testid="additional-comments"
            />
            <Box>
              <FormLabel component="legend" aria-label="Make this idea private?">
                Make this idea private?
              </FormLabel>
              <RadioGroup
                row
                name="isPrivate"
                aria-label="Make this idea private?"
                value={isPrivate ? "true" : "false"}
                onChange={(e) => setIsPrivate(e.target.value === "true")}
                data-testid="private-radio"
              >
                <FormControlLabel
                  value="true"
                  control={<Radio />}
                  label="Yes (only visible to admins)"
                />
                <FormControlLabel
                  value="false"
                  control={<Radio />}
                  label="No (visible to everyone)"
                />
              </RadioGroup>
            </Box>
            <Box
              sx={{
                position: "sticky",
                bottom: 0,
                bgcolor: "background.paper",
                pt: SPACING.small,
                pb: SPACING.small,
                zIndex: 1,
              }}
            >
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                aria-label="Submit idea"
                data-testid="submit-idea-btn"
                disabled={isSubmitting}
                sx={{ minHeight: "48px", py: 1.5 }}
                startIcon={
                  isSubmitting ? (
                    <CircularProgress size={20} color="inherit" data-testid="submit-loading" />
                  ) : null
                }
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </Box>
            {isSubmitting && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <CircularProgress data-testid="loading-indicator" />
              </Box>
            )}
            <Box sx={{ mt: 2 }} aria-live="polite">
              {error && (
                <Alert severity="error" data-testid="error-message">
                  {error}
                </Alert>
              )}
              {error && error.includes("Title is required") && (
                <Alert severity="error" data-testid="title-error" sx={{ mt: 1 }}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert severity="success" data-testid="success-message">
                  {success}
                </Alert>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
