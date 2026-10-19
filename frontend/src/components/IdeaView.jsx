import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { orgPath } from "../utils/orgPath";
import { api } from "../api";
import CommentList from "./CommentList";
import { ThemeContext } from "../contexts";
import { useAuth } from "../auth";
import { validateProfanity } from "../utils/textValidation";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { useResponsive } from "../hooks/useResponsive";
import { CARD_SHADOW } from "../muiTheme";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Divider,
  Avatar,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Slider,
} from "@mui/material";
import {
  ChatBubbleOutlined,
  ThumbUp,
  Circle,
  Person,
  AdminPanelSettings,
  Send,
  Share,
  PushPin,
  ArrowBack,
  Refresh,
  Edit,
  Delete,
} from "@mui/icons-material";

export default function IdeaView({ idea, showBackButton = false, orgId }) {
  // SECURITY: Validate user can only access their own org
  useOrgAccessGuard();

  const [voteCount, setVoteCount] = useState(idea.votes ? idea.votes.length : 0);
  const [voted, setVoted] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showAdminComments, setShowAdminComments] = useState(false);
  const [updatedIdea, setUpdatedIdea] = useState(idea);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adminCommentSuccess, setAdminCommentSuccess] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const [adminComments, setAdminComments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isPinned, setIsPinned] = useState(idea.isPinned || false);
  const { isMobile } = useResponsive();
  const [adminCommentVotes, setAdminCommentVotes] = useState({});
  const [editingAdminComment, setEditingAdminComment] = useState(null);
  const [editAdminContent, setEditAdminContent] = useState("");
  const [deleteAdminDialogOpen, setDeleteAdminDialogOpen] = useState(false);
  const [adminCommentToDelete, setAdminCommentToDelete] = useState(null);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [categoryInput, setCategoryInput] = useState(updatedIdea.category || "");
  const [timeSavedEdit, setTimeSavedEdit] = useState(idea.timeSavedMinutes?.toString() || "");
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [actualTimeSaved, setActualTimeSaved] = useState("");
  const [actualFreqCount, setActualFreqCount] = useState("");
  const [actualFreqPeriod, setActualFreqPeriod] = useState("");
  const { user } = useAuth();
  const theme = useContext(ThemeContext);
  const navigate = useNavigate();

  // Auto-dismiss success alerts after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (adminCommentSuccess) {
      const timer = setTimeout(() => setAdminCommentSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [adminCommentSuccess]);

  // Auto-dismiss error alert after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch dynamic categories from database
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get("/categories");
        const fetchedCats = Array.isArray(res.data) ? res.data : [];
        setDynamicCategories(fetchedCats.map((cat) => cat.name));
      } catch (error) {
        console.error("Failed to fetch categories:", error);
        // If fetch fails, we'll use the hardcoded ones
      }
    };
    fetchCategories();
  }, []);

  const handleShare = () => {
    const ideaUrl = `${window.location.origin}${orgPath(orgId, `idea/${updatedIdea.slug || updatedIdea.id}`)}`;
    const subject = `Business Idea: ${updatedIdea.title}`;
    const body = `I wanted to share this business idea with you:\n\n"${updatedIdea.title}"\n\n${updatedIdea.description}\n\nView and comment here: ${ideaUrl}`;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  const handlePin = async () => {
    setError("");
    setSuccess("");
    try {
      await api.patch(`/ideas/${idea.id}/admin`, { isPinned: !isPinned });
      setIsPinned(!isPinned);
      setSuccess(isPinned ? "Idea unpinned" : "Idea pinned to top");
    } catch (err) {
      setError("Failed to update pin status");
    }
  };

  // Handle impact/effort score updates (Phase 1 - Advanced Analytics)
  const handleScoreChange = async (field, value) => {
    if (value < 1 || value > 10) return; // Validate range

    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api.patch(`/ideas/${idea.id}/admin`, { [field]: value });
      setUpdatedIdea({ ...updatedIdea, [field]: value });
      setSuccess(`${field === "impactScore" ? "Impact" : "Effort"} score updated`);
    } catch (err) {
      setError(`Failed to update ${field === "impactScore" ? "impact" : "effort"} score`);
    } finally {
      setSaving(false);
    }
  };

  // Status options for admin
  const statusOptions = [
    "Reviewing",
    "In Progress",
    "Approved",
    "Complete",
    "Rejected",
    "Duplicate",
    "Hidden",
    "Open",
  ];

  // Use only dynamic categories from database
  const allCategories = dynamicCategories.sort();

  // Helper function to get category background color
  const getCategoryBackgroundColor = () => {
    return "#f0f7ff"; // Light blue background
  };

  // Helper function to get category border color
  const getCategoryBorderColor = () => {
    return "#2196f3"; // Blue border
  };

  // Helper function to get status color matching the card icons
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "in progress":
      case "approved":
      case "complete":
        return "success";
      case "reviewing":
        return "warning";
      case "rejected":
      case "duplicate":
      case "hidden":
        return "error";
      default:
        return "default";
    }
  };

  // Get status color for chips
  const getStatusChipColor = (status) => {
    const colorMap = {
      success: "#2e7d32",
      warning: "#ed6c02",
      error: "#d32f2f",
      default: "#757575",
    };
    return colorMap[getStatusColor(status)];
  };

  // Get status background color (light shades)
  const getStatusBackgroundColor = (status) => {
    const backgroundMap = {
      success: "#e8f5e8",
      warning: "#fff3e0",
      error: "#ffebee",
      default: "#f5f5f5",
    };
    return backgroundMap[getStatusColor(status)];
  };

  // Load admin comments function
  const loadAdminComments = async () => {
    if (!user?.isAdmin || !idea?.id) return;

    try {
      const response = await api.get(`/comments/admin/idea/${idea.id}`);

      // All comments returned are admin-only comments
      setAdminComments(response.data);

      // Set up admin comment votes tracking
      const adminVotes = {};
      response.data.forEach((comment) => {
        adminVotes[comment.id] = comment.userVoted || false;
      });
      setAdminCommentVotes(adminVotes);
    } catch (err) {
      console.error("Failed to load admin comments:", err);
    }
  };

  // Load admin comments
  useEffect(() => {
    loadAdminComments();
  }, [user?.isAdmin, idea?.id]);

  const handleIdeaUpdate = (newIdeaData) => {
    setUpdatedIdea({ ...newIdeaData });
  };

  // Handle admin status change - Issue #433
  const handleStatusChange = async (newStatus) => {
    // If changing to "Complete", show dialog to update actual time saved
    if (newStatus === "Complete" && updatedIdea.timeSavedMinutes) {
      setPendingStatus(newStatus);
      // Pre-fill with original estimates
      setActualTimeSaved(updatedIdea.actualTimeSavedMinutes || updatedIdea.timeSavedMinutes || "");
      setActualFreqCount(updatedIdea.actualFrequencyCount || updatedIdea.frequencyCount || "");
      setActualFreqPeriod(updatedIdea.actualFrequencyPeriod || updatedIdea.frequencyPeriod || "");
      setCompleteDialogOpen(true);
      return;
    }

    // Otherwise, update status directly
    setSaving(true);
    setError("");
    console.log("Updating status for idea ID:", idea.id);
    try {
      await api.patch(`/ideas/${idea.id}/admin`, { status: newStatus });
      setUpdatedIdea({ ...updatedIdea, status: newStatus });
      setSuccess("Status updated successfully!");
    } catch (err) {
      setError("Failed to update status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Handle confirming completion with actual time saved
  const handleConfirmComplete = async () => {
    setSaving(true);
    setError("");
    try {
      const updateData = {
        status: pendingStatus,
        actualTimeSavedMinutes: actualTimeSaved ? parseInt(actualTimeSaved, 10) : null,
        actualFrequencyCount: actualFreqCount ? parseInt(actualFreqCount, 10) : null,
        actualFrequencyPeriod: actualFreqPeriod || null,
      };

      await api.patch(`/ideas/${idea.id}/admin`, updateData);
      setUpdatedIdea({
        ...updatedIdea,
        status: pendingStatus,
        actualTimeSavedMinutes: updateData.actualTimeSavedMinutes,
        actualFrequencyCount: updateData.actualFrequencyCount,
        actualFrequencyPeriod: updateData.actualFrequencyPeriod,
      });
      setSuccess("Idea marked as complete with actual time saved updated!");
      setCompleteDialogOpen(false);
      setPendingStatus(null);
    } catch (err) {
      setError("Failed to update idea. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Handle skipping actual time saved update
  const handleSkipActualTimeSaved = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/ideas/${idea.id}/admin`, { status: pendingStatus });
      setUpdatedIdea({ ...updatedIdea, status: pendingStatus });
      setSuccess("Status updated successfully!");
      setCompleteDialogOpen(false);
      setPendingStatus(null);
    } catch (err) {
      setError("Failed to update status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelComplete = () => {
    setCompleteDialogOpen(false);
    setPendingStatus(null);
  };

  // Handle admin category change
  const handleCategoryChange = async (newCategory) => {
    setSaving(true);
    setError("");
    try {
      // Auto-create category if it doesn't exist
      const categoryExists = allCategories.includes(newCategory);
      if (!categoryExists && newCategory.trim()) {
        try {
          await api.post("/categories", { name: newCategory });
          // Refresh categories after creating new one
          const res = await api.get("/categories");
          const fetchedCats = Array.isArray(res.data) ? res.data : [];
          setDynamicCategories(fetchedCats.map((cat) => cat.name));
        } catch (catError) {
          console.error("Category creation warning:", catError);
          // Continue even if category creation fails
        }
      }

      await api.patch(`/ideas/${idea.id}/admin`, { category: newCategory });
      setUpdatedIdea({ ...updatedIdea, category: newCategory });
      setCategoryInput(newCategory);
      setSuccess("Category updated successfully!");
    } catch (err) {
      setError("Failed to update category. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Handle admin editing of time saved per instance
  const handleTimeSavedSave = async () => {
    const parsed = parseInt(timeSavedEdit, 10);
    const newValue =
      timeSavedEdit.trim() === "" ? null : isNaN(parsed) || parsed < 0 ? null : parsed;
    if (newValue === (updatedIdea.timeSavedMinutes ?? null)) return;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/ideas/${idea.id}/admin`, { timeSavedMinutes: newValue });
      setUpdatedIdea({ ...updatedIdea, timeSavedMinutes: newValue });
      setSuccess("Time saved updated");
    } catch (err) {
      setError("Failed to update time saved");
    } finally {
      setSaving(false);
    }
  };

  // Handle admin comment submission
  const handleAdminCommentSubmit = async () => {
    if (!adminComment.trim()) return;

    // Validate profanity
    const profanityCheck = validateProfanity(adminComment);
    if (!profanityCheck.isValid) {
      setError(profanityCheck.error);
      return;
    }

    setSaving(true);
    try {
      const response = await api.post(`/comments/admin/idea/${idea.id}`, {
        content: adminComment,
      });

      // Reload admin comments to get the latest data with vote counts
      await loadAdminComments();

      setAdminComment("");
      setAdminCommentSuccess("Admin comment added successfully!");
    } catch (err) {
      setError("Failed to add admin comment.");
    } finally {
      setSaving(false);
    }
  };

  // Handle admin comment voting
  const handleAdminCommentVote = async (commentId) => {
    setError("");
    setSuccess("");
    try {
      const isVoted = adminCommentVotes[commentId] || false;

      if (isVoted) {
        await api.delete(`/comments/${commentId}/upvote`);
        setSuccess("Vote removed from admin comment!");
      } else {
        await api.post(`/comments/${commentId}/upvote`);
        setSuccess("Vote added to admin comment!");
      }

      // Update local state
      setAdminCommentVotes((prev) => ({
        ...prev,
        [commentId]: !isVoted,
      }));

      // Refresh admin comments to get updated vote counts
      await loadAdminComments();
    } catch (err) {
      setError("Failed to vote on admin comment. Please try again.");
    }
  };

  // Handle admin comment editing
  const handleEditAdminComment = (comment) => {
    setEditingAdminComment(comment.id);
    setEditAdminContent(comment.content);
  };

  const handleSaveAdminEdit = async () => {
    setError("");
    setAdminCommentSuccess("");
    try {
      await api.put(`/comments/${editingAdminComment}`, { content: editAdminContent });
      setEditingAdminComment(null);
      setEditAdminContent("");
      await loadAdminComments();
      setAdminCommentSuccess("Admin comment updated successfully!");
    } catch (err) {
      setError("Failed to update admin comment.");
    }
  };

  const handleCancelAdminEdit = () => {
    setEditingAdminComment(null);
    setEditAdminContent("");
  };

  // Handle admin comment deletion
  const handleDeleteAdminComment = (comment) => {
    setAdminCommentToDelete(comment);
    setDeleteAdminDialogOpen(true);
  };

  const confirmDeleteAdminComment = async () => {
    setError("");
    setAdminCommentSuccess("");
    try {
      await api.delete(`/comments/${adminCommentToDelete.id}`);
      setDeleteAdminDialogOpen(false);
      setAdminCommentToDelete(null);
      await loadAdminComments();
      setAdminCommentSuccess("Admin comment deleted successfully!");
    } catch (err) {
      setError("Failed to delete admin comment.");
    }
  };

  // Check if current user can moderate this admin comment
  // Admins can edit their own admin comments, but NOT other admins' comments
  const canModerateAdminComment = (comment) => {
    return user && user.isAdmin && comment.author && comment.author.id === user.id;
  };

  const handleVote = async () => {
    setError("");
    setSuccess("");
    try {
      await api.post(`/votes/idea/${idea.id}`);
      setVoteCount(voteCount + 1);
      setVoted(true);
      setSuccess("Vote registered successfully!");
    } catch (err) {
      setError("Failed to register vote. Please try again.");
    }
  };

  const handleUnvote = async () => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/votes/idea/${idea.id}`);
      setVoteCount(voteCount - 1);
      setVoted(false);
      setSuccess("Vote removed successfully!");
    } catch (err) {
      setError("Failed to remove vote. Please try again.");
    }
  };

  // Get creator display name
  const getCreatorDisplay = () => {
    if (updatedIdea.authorId === "anonymous") {
      return "Anonymous";
    }
    // Null author = the account was deleted; content survives (#930).
    return updatedIdea.authorName || "Former member";
  };

  return (
    <Box
      sx={{ width: "100%", maxWidth: 800, mx: "auto", pt: { xs: 2, sm: 0 }, px: { xs: 2, sm: 0 } }}
      aria-label="Idea details"
    >
      {showBackButton && (
        <Box sx={{ mb: 2 }}>
          <Button
            data-testid="back-button"
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => {
              const storedOrgId = orgId || localStorage.getItem("organizationId");
              if (storedOrgId) {
                navigate(orgPath(storedOrgId, "review"));
              } else {
                navigate("/org");
              }
            }}
            size="small"
            sx={{
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            Back to Ideas
          </Button>
        </Box>
      )}
      <Card
        sx={{
          mb: 3,
          boxShadow: CARD_SHADOW,
        }}
        aria-label="Idea card"
      >
        <CardContent sx={{ p: 3 }}>
          {/* Header with title, status, category, and stats */}
          <Box sx={{ mb: 3 }}>
            {/* Title and creator */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
                  {updatedIdea.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Person sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary">
                    Created by {getCreatorDisplay()}
                  </Typography>
                </Box>
              </Box>

              {/* Top right - removed icons */}
            </Box>

            {/* Combined buttons layout - responsive */}
            {isMobile ? (
              /* Mobile: controls left, icon strip right */
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 1,
                  mb: 2,
                }}
              >
                {/* Left column: Status and Category stacked */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                  data-testid={user?.isAdmin ? "admin-controls" : undefined}
                >
                  {/* Status */}
                  {user?.isAdmin ? (
                    <FormControl size="small" sx={{ width: "100%", height: 32 }}>
                      <Select
                        value={updatedIdea.status || ""}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={saving}
                        renderValue={(value) => (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              overflow: "hidden",
                            }}
                          >
                            <Circle
                              sx={{ fontSize: 8, color: getStatusChipColor(value), flexShrink: 0 }}
                            />
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {value}
                            </span>
                          </Box>
                        )}
                        sx={{
                          height: 32,
                          fontSize: "0.875rem",
                          backgroundColor: getStatusBackgroundColor(updatedIdea.status),
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: getStatusChipColor(updatedIdea.status),
                          },
                          "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: getStatusChipColor(updatedIdea.status),
                          },
                          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderColor: `${getStatusChipColor(updatedIdea.status)} !important`,
                            borderWidth: "2px",
                          },
                          "& .MuiSelect-select": {
                            display: "flex",
                            alignItems: "center",
                            padding: "6px 12px",
                            overflow: "hidden",
                          },
                        }}
                      >
                        {statusOptions.map((status) => (
                          <MenuItem
                            key={status}
                            value={status}
                            sx={{
                              fontSize: "0.875rem",
                              backgroundColor: getStatusBackgroundColor(status),
                              "&:hover": {
                                backgroundColor: `${getStatusBackgroundColor(status)} !important`,
                                opacity: 0.8,
                              },
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Circle sx={{ fontSize: 8, color: getStatusChipColor(status) }} />
                              {status}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Chip
                      label={updatedIdea.status}
                      size="small"
                      sx={{
                        backgroundColor: getStatusBackgroundColor(updatedIdea.status),
                        color: getStatusChipColor(updatedIdea.status),
                        border: `1px solid ${getStatusChipColor(updatedIdea.status)}`,
                        height: 32,
                        borderRadius: 1,
                        fontSize: "0.875rem",
                      }}
                      icon={<Circle sx={{ fontSize: "12px !important" }} />}
                    />
                  )}

                  {/* Category */}
                  {user?.isAdmin ? (
                    <Autocomplete
                      freeSolo
                      openOnFocus
                      options={allCategories}
                      value={updatedIdea.category || ""}
                      inputValue={categoryInput}
                      onInputChange={(e, v, reason) => {
                        if (reason !== "reset") setCategoryInput(v);
                      }}
                      onChange={(e, newValue) => {
                        if (newValue === null) {
                          setUpdatedIdea((prev) => ({ ...prev, category: "" }));
                          setCategoryInput("");
                        } else if (newValue && newValue !== updatedIdea.category) {
                          handleCategoryChange(newValue);
                        }
                      }}
                      disabled={saving}
                      size="small"
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          data-testid="admin-category-input"
                          placeholder="Select or type"
                          onFocus={() => setCategoryInput("")}
                          sx={{
                            "& .MuiInputBase-root": {
                              height: 32,
                              fontSize: "0.875rem",
                              padding: "0 !important",
                              backgroundColor: getCategoryBackgroundColor(),
                            },
                            "& .MuiInputBase-input": {
                              padding: "6px 12px !important",
                              fontSize: "0.875rem",
                            },
                            "& .MuiOutlinedInput-notchedOutline": {
                              borderColor: getCategoryBorderColor(),
                            },
                            "&:hover .MuiOutlinedInput-notchedOutline": {
                              borderColor: getCategoryBorderColor(),
                            },
                            "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
                              borderColor: `${getCategoryBorderColor()} !important`,
                              borderWidth: "2px",
                            },
                          }}
                        />
                      )}
                      renderOption={(props, option) => (
                        <li
                          {...props}
                          style={{
                            backgroundColor: getCategoryBackgroundColor(),
                            fontSize: "0.875rem",
                          }}
                        >
                          {option}
                        </li>
                      )}
                      sx={{ width: "100%" }}
                    />
                  ) : (
                    <Box
                      sx={{
                        px: 2,
                        py: 0.75,
                        border: "1px solid #e0e0e0",
                        borderRadius: 1,
                        backgroundColor: "#f9f9f9",
                        width: "100%",
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.875rem" }}
                      >
                        {updatedIdea.category}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Right column: icon strip */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    pt: 0.5,
                  }}
                >
                  {user?.isAdmin && (
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <IconButton
                        size="small"
                        onClick={() => setShowAdminComments(!showAdminComments)}
                        sx={{ color: showAdminComments ? "#1565c0" : "text.secondary" }}
                      >
                        <AdminPanelSettings fontSize="small" />
                      </IconButton>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.65rem",
                          color: showAdminComments ? "#1565c0" : "text.secondary",
                          lineHeight: 1,
                        }}
                      >
                        Admin
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <IconButton size="small" onClick={handleShare} sx={{ color: "text.secondary" }}>
                      <Share fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: "0.65rem", color: "text.secondary", lineHeight: 1 }}
                    >
                      Share
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <IconButton
                      size="small"
                      onClick={voted ? handleUnvote : handleVote}
                      disabled={!user}
                      aria-label={
                        voted ? `Remove like (${voteCount})` : `Like this idea (${voteCount})`
                      }
                      sx={{ color: voted ? "primary.main" : "text.secondary" }}
                    >
                      <ThumbUp fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.65rem",
                        color: voted ? "primary.main" : "text.secondary",
                        lineHeight: 1,
                      }}
                    >
                      {voteCount}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              /* Desktop: Single row with left/right justification */
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  mb: 2,
                  flexWrap: "nowrap",
                  minWidth: 0,
                }}
              >
                {/* Left side: Status and Category (editable for admins, static for users) */}
                <Box
                  sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    minWidth: 0,
                    flex: 1,
                    overflow: "hidden",
                  }}
                  data-testid={user?.isAdmin ? "admin-controls" : undefined}
                >
                  {/* Status */}
                  {user?.isAdmin ? (
                    <FormControl size="small" sx={{ width: 160, height: 32 }}>
                      <Select
                        value={updatedIdea.status || ""}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={saving}
                        renderValue={(value) => (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              overflow: "hidden",
                            }}
                          >
                            <Circle
                              sx={{ fontSize: 8, color: getStatusChipColor(value), flexShrink: 0 }}
                            />
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {value}
                            </span>
                          </Box>
                        )}
                        sx={{
                          height: 32,
                          fontSize: "0.875rem",
                          backgroundColor: getStatusBackgroundColor(updatedIdea.status),
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: getStatusChipColor(updatedIdea.status),
                          },
                          "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: getStatusChipColor(updatedIdea.status),
                          },
                          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderColor: `${getStatusChipColor(updatedIdea.status)} !important`,
                            borderWidth: "2px",
                          },
                          "& .MuiSelect-select": {
                            display: "flex",
                            alignItems: "center",
                            padding: "6px 12px",
                            overflow: "hidden",
                          },
                        }}
                      >
                        {statusOptions.map((status) => (
                          <MenuItem
                            key={status}
                            value={status}
                            sx={{
                              fontSize: "0.875rem",
                              backgroundColor: getStatusBackgroundColor(status),
                              "&:hover": {
                                backgroundColor: `${getStatusBackgroundColor(status)} !important`,
                                opacity: 0.8,
                              },
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Circle sx={{ fontSize: 8, color: getStatusChipColor(status) }} />
                              {status}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Chip
                      label={updatedIdea.status}
                      size="small"
                      sx={{
                        backgroundColor: getStatusBackgroundColor(updatedIdea.status),
                        color: getStatusChipColor(updatedIdea.status),
                        border: `1px solid ${getStatusChipColor(updatedIdea.status)}`,
                        height: 32,
                        borderRadius: 1,
                        fontSize: "0.875rem",
                      }}
                      icon={<Circle sx={{ fontSize: "12px !important" }} />}
                    />
                  )}

                  {/* Category */}
                  {user?.isAdmin ? (
                    <Autocomplete
                      freeSolo
                      openOnFocus
                      options={allCategories}
                      value={updatedIdea.category || ""}
                      inputValue={categoryInput}
                      onInputChange={(e, v, reason) => {
                        if (reason !== "reset") setCategoryInput(v);
                      }}
                      onChange={(e, newValue) => {
                        if (newValue === null) {
                          setUpdatedIdea((prev) => ({ ...prev, category: "" }));
                          setCategoryInput("");
                        } else if (newValue && newValue !== updatedIdea.category) {
                          handleCategoryChange(newValue);
                        }
                      }}
                      disabled={saving}
                      size="small"
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          data-testid="admin-category-input"
                          placeholder="Select or type"
                          onFocus={() => setCategoryInput("")}
                          sx={{
                            "& .MuiInputBase-root": {
                              height: 32,
                              fontSize: "0.875rem",
                              padding: "0 !important",
                              backgroundColor: getCategoryBackgroundColor(),
                            },
                            "& .MuiInputBase-input": {
                              padding: "6px 12px !important",
                              fontSize: "0.875rem",
                            },
                            "& .MuiOutlinedInput-notchedOutline": {
                              borderColor: getCategoryBorderColor(),
                            },
                            "&:hover .MuiOutlinedInput-notchedOutline": {
                              borderColor: getCategoryBorderColor(),
                            },
                            "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
                              borderColor: `${getCategoryBorderColor()} !important`,
                              borderWidth: "2px",
                            },
                          }}
                        />
                      )}
                      renderOption={(props, option) => (
                        <li
                          {...props}
                          style={{
                            backgroundColor: getCategoryBackgroundColor(),
                            fontSize: "0.875rem",
                          }}
                        >
                          {option}
                        </li>
                      )}
                      sx={{ width: 160 }}
                    />
                  ) : (
                    <Chip
                      label={updatedIdea.category}
                      size="small"
                      sx={{
                        backgroundColor: getCategoryBackgroundColor(),
                        color: getCategoryBorderColor(),
                        border: `1px solid ${getCategoryBorderColor()}`,
                        height: 32,
                        borderRadius: 1,
                        fontSize: "0.875rem",
                        width: 160,
                        justifyContent: "flex-start",
                        "& .MuiChip-label": {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          px: 1.5,
                        },
                      }}
                    />
                  )}
                </Box>

                {/* Right side: Action icons */}
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", flexShrink: 0 }}>
                  {user?.isAdmin && (
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: 52,
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => setShowAdminComments(!showAdminComments)}
                        sx={{ color: showAdminComments ? "#1565c0" : "text.secondary" }}
                      >
                        <AdminPanelSettings fontSize="small" />
                      </IconButton>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.7rem",
                          color: showAdminComments ? "#1565c0" : "text.secondary",
                          lineHeight: 1,
                          textAlign: "center",
                        }}
                      >
                        Admin
                      </Typography>
                    </Box>
                  )}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: 52,
                    }}
                  >
                    <IconButton size="small" onClick={handleShare} sx={{ color: "text.secondary" }}>
                      <Share fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.7rem",
                        color: "text.secondary",
                        lineHeight: 1,
                        textAlign: "center",
                      }}
                    >
                      Share
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: 52,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={voted ? handleUnvote : handleVote}
                      disabled={!user}
                      aria-label={
                        voted ? `Remove like (${voteCount})` : `Like this idea (${voteCount})`
                      }
                      sx={{ color: voted ? "primary.main" : "text.secondary" }}
                    >
                      <ThumbUp fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.7rem",
                        color: voted ? "primary.main" : "text.secondary",
                        lineHeight: 1,
                        textAlign: "center",
                      }}
                    >
                      {voteCount}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          {/* Fixed JSX structure */}
          <Divider sx={{ mb: 3 }} />

          {/* Description Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}>
              Description
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
              {updatedIdea.description}
            </Typography>
          </Box>

          {/* Content sections */}
          <Stack spacing={3}>
            {/* Section: Impact of Issue */}
            {updatedIdea.orgImpact && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
                >
                  Impact of Issue
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                  {updatedIdea.orgImpact}
                </Typography>
              </Box>
            )}

            {/* Section: Impact of Fixing Issue */}
            {updatedIdea.fixImpact && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
                >
                  Impact of Fixing Issue
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                  {updatedIdea.fixImpact}
                </Typography>
              </Box>
            )}

            {/* Section: Proposed Solutions */}
            {updatedIdea.solution && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
                >
                  Proposed Solutions
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                  {updatedIdea.solution}
                </Typography>
              </Box>
            )}

            {/* Section: Would Spend Own Money */}
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
              >
                If it were your business, would you spend your own money on it?
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                {typeof updatedIdea.wouldSpendOwnMoney === "boolean"
                  ? updatedIdea.wouldSpendOwnMoney
                    ? "Yes"
                    : "No"
                  : "Not specified"}
              </Typography>
            </Box>

            {/* Section: Time Saved Per Instance */}
            {(updatedIdea.timeSavedMinutes || user?.isAdmin) && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
                >
                  Time Saved Per Instance
                </Typography>
                {user?.isAdmin ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TextField
                      type="number"
                      size="small"
                      value={timeSavedEdit}
                      onChange={(e) => setTimeSavedEdit(e.target.value)}
                      onBlur={handleTimeSavedSave}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.target.blur();
                        }
                      }}
                      disabled={saving}
                      placeholder="0"
                      inputProps={{ min: 0, style: { width: 72 } }}
                      sx={{ width: 96 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      minutes per instance
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body1" sx={{ color: "text.secondary" }}>
                    {updatedIdea.timeSavedMinutes} minute
                    {updatedIdea.timeSavedMinutes !== 1 ? "s" : ""}
                  </Typography>
                )}
              </Box>
            )}

            {/* Section: Impact & Effort Scores (Phase 1 - Advanced Analytics) */}
            {user?.isAdmin && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 2, color: "text.primary" }}
                >
                  Priority Matrix Scores
                </Typography>

                {/* Impact Score */}
                <Box sx={{ mb: 3 }}>
                  <Typography
                    variant="body2"
                    sx={{ mb: 1, fontWeight: 600, color: "text.primary" }}
                  >
                    Impact Score: {updatedIdea.impactScore || 5}
                  </Typography>
                  <Slider
                    value={updatedIdea.impactScore || 5}
                    onChange={(e, newValue) => handleScoreChange("impactScore", newValue)}
                    aria-label="Impact Score"
                    valueLabelDisplay="auto"
                    step={1}
                    marks
                    min={1}
                    max={10}
                    disabled={saving}
                    sx={{
                      "& .MuiSlider-markLabel": {
                        fontSize: "0.75rem",
                      },
                    }}
                  />
                  <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Low Impact
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      High Impact
                    </Typography>
                  </Box>
                </Box>

                {/* Effort Score */}
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ mb: 1, fontWeight: 600, color: "text.primary" }}
                  >
                    Effort Score: {updatedIdea.effortScore || 5}
                  </Typography>
                  <Slider
                    value={updatedIdea.effortScore || 5}
                    onChange={(e, newValue) => handleScoreChange("effortScore", newValue)}
                    aria-label="Effort Score"
                    valueLabelDisplay="auto"
                    step={1}
                    marks
                    min={1}
                    max={10}
                    disabled={saving}
                    sx={{
                      "& .MuiSlider-markLabel": {
                        fontSize: "0.75rem",
                      },
                    }}
                  />
                  <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Easy
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Very Difficult
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Section: Additional Comments */}
            {updatedIdea.additionalComments && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}
                >
                  Additional Comments
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                  {updatedIdea.additionalComments}
                </Typography>
              </Box>
            )}
          </Stack>

          {/* Alerts */}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}

          {/* Admin Comments Section - Only visible to admins, appears first */}
          {user?.isAdmin && showAdminComments && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ maxWidth: 700, mx: "auto", my: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    border: `1px solid #c4c4c4c4`,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
                    background: theme.backgroundPaper || "#fff",
                  }}
                >
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <AdminPanelSettings sx={{ color: "#1565c0", fontSize: 20 }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, color: "#1565c0" }}>
                          Admin Comments
                        </Typography>
                      </Box>
                      <Button
                        variant={isPinned ? "greyscaleActive" : "greyscale"}
                        onClick={handlePin}
                        size="small"
                        startIcon={<PushPin sx={{ fontSize: 18 }} />}
                        sx={{
                          height: 32,
                          width: 120,
                          fontSize: "0.875rem",
                          textTransform: "none",
                        }}
                        title={isPinned ? "Unpin idea" : "Pin idea to top"}
                      >
                        {isPinned ? "Pin" : "Unpin"}
                      </Button>
                    </Box>

                    {adminComments.length === 0 && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 2, fontStyle: "italic" }}
                      >
                        No admin comments yet
                      </Typography>
                    )}

                    {/* Display admin comments */}
                    <Box sx={{ mb: 3 }}>
                      {adminComments.map((comment) => (
                        <Box key={comment.id} sx={{ display: "flex", gap: 2, pb: 2 }}>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              pt: 0.5,
                            }}
                          >
                            {/* Vote button for admin comments */}
                            <IconButton
                              onClick={() => handleAdminCommentVote(comment.id)}
                              title={
                                adminCommentVotes[comment.id]
                                  ? "Remove upvote"
                                  : "Upvote this comment"
                              }
                              size="small"
                              aria-label={
                                adminCommentVotes[comment.id]
                                  ? "Remove upvote from comment"
                                  : "Upvote this comment"
                              }
                              disabled={!user}
                              sx={{
                                color: adminCommentVotes[comment.id]
                                  ? "primary.main"
                                  : "text.secondary",
                                "&:hover": {
                                  color: adminCommentVotes[comment.id]
                                    ? "primary.dark"
                                    : "primary.main",
                                  backgroundColor: adminCommentVotes[comment.id]
                                    ? "action.hover"
                                    : "action.hover",
                                },
                              }}
                            >
                              <ThumbUp fontSize="small" />
                            </IconButton>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                mt: 1,
                                color:
                                  (comment.votes?.length || 0) > 0
                                    ? theme.primaryColor
                                    : "text.secondary",
                              }}
                            >
                              {comment.votes?.length || 0}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                mb: 0.5,
                              }}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Avatar
                                  sx={{
                                    width: { xs: 20, sm: 24 },
                                    height: { xs: 20, sm: 24 },
                                    bgcolor: comment.author?.isSuperuser ? "#B8860B" : "#1565c0",
                                  }}
                                >
                                  <AdminPanelSettings sx={{ fontSize: 12 }} />
                                </Avatar>
                                <Typography
                                  variant="subtitle2"
                                  sx={{
                                    fontWeight: 600,
                                    color: comment.author?.isSuperuser ? "#B8860B" : "#1565c0",
                                  }}
                                >
                                  {comment.author?.displayName ||
                                    comment.author?.username ||
                                    "Former member"}
                                  {comment.author &&
                                    ` (${comment.author.isSuperuser ? "Superuser" : "Admin"})`}
                                </Typography>
                              </Box>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(comment.createdAt).toLocaleDateString()}
                                </Typography>
                                {comment.isEdited && (
                                  <Typography variant="caption" color="text.secondary">
                                    (edited)
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                            {editingAdminComment === comment.id ? (
                              <Box sx={{ mt: 1 }}>
                                <TextField
                                  fullWidth
                                  multiline
                                  rows={3}
                                  value={editAdminContent}
                                  onChange={(e) => setEditAdminContent(e.target.value)}
                                  variant="outlined"
                                  size="small"
                                  sx={{ mb: 1 }}
                                />
                                <Box sx={{ display: "flex", gap: 1 }}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={handleSaveAdminEdit}
                                    disabled={!editAdminContent.trim()}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={handleCancelAdminEdit}
                                  >
                                    Cancel
                                  </Button>
                                </Box>
                              </Box>
                            ) : (
                              <>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ whiteSpace: "pre-line" }}
                                >
                                  {comment.content}
                                </Typography>
                                {canModerateAdminComment(comment) && (
                                  <Box
                                    sx={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: 0.5,
                                      mt: 1,
                                    }}
                                  >
                                    <IconButton
                                      size="small"
                                      onClick={() => handleEditAdminComment(comment)}
                                      title="Edit comment"
                                    >
                                      <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDeleteAdminComment(comment)}
                                      title="Delete comment"
                                    >
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Box>
                                )}
                              </>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Box>

                    <Divider />

                    {/* Add new admin comment - matching regular comments structure */}
                    <Box
                      component="form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAdminCommentSubmit();
                      }}
                      sx={{ mt: 2 }}
                    >
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="Add a comment"
                        value={adminComment}
                        onChange={(e) => setAdminComment(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ mb: 2 }}
                        required
                      />
                      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          type="submit"
                          variant="outlined"
                          disabled={!adminComment.trim() || saving}
                          sx={{
                            color: adminComment.trim() ? "white" : "text.primary",
                            border: adminComment.trim()
                              ? "1px solid"
                              : "1px solid #c4c4c4c4 !important",
                            borderColor: adminComment.trim() ? "primary.main" : undefined,
                            backgroundColor: adminComment.trim() ? "primary.main" : "transparent",
                            borderRadius: 1,
                            height: 32,
                            fontSize: "0.875rem",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            px: 3,
                            "&:hover": {
                              backgroundColor: adminComment.trim() ? "primary.dark" : "#e0e0e0",
                              borderColor: adminComment.trim() ? "primary.dark" : "#b0b0b0",
                              color: adminComment.trim() ? "white" : "text.primary",
                            },
                            "&:disabled": {
                              color: "text.secondary",
                              borderColor: "#fcfcfc",
                              backgroundColor: "transparent",
                            },
                          }}
                          aria-label="Add admin comment"
                        >
                          {saving ? "Adding..." : "COMMENT"}
                        </Button>
                      </Box>
                      {error && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                          {error}
                        </Alert>
                      )}
                      {adminCommentSuccess && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                          {adminCommentSuccess}
                        </Alert>
                      )}
                    </Box>
                  </CardContent>
                </Card>

                {/* Delete Admin Comment Confirmation Dialog */}
                <Dialog
                  open={deleteAdminDialogOpen}
                  onClose={() => setDeleteAdminDialogOpen(false)}
                >
                  <DialogTitle>Delete Admin Comment</DialogTitle>
                  <DialogContent>
                    Are you sure you want to delete this admin comment? This action cannot be
                    undone.
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setDeleteAdminDialogOpen(false)}>Cancel</Button>
                    <Button onClick={confirmDeleteAdminComment} color="error" variant="contained">
                      Delete
                    </Button>
                  </DialogActions>
                </Dialog>
              </Box>
            </Box>
          )}

          {/* Comments Section */}
          {showComments && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <CommentList ideaId={idea.id} />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Complete Idea Dialog - Issue #433 */}
      <Dialog open={completeDialogOpen} onClose={handleCancelComplete} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Idea as Complete</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Alert severity="info">
              Would you like to update the actual time saved now that this idea has been
              implemented?
            </Alert>

            <Typography variant="body2" color="text.secondary">
              <strong>Original Estimate:</strong> {updatedIdea.timeSavedMinutes} minutes
              {updatedIdea.frequencyCount && updatedIdea.frequencyPeriod && (
                <>
                  {" "}
                  ({updatedIdea.frequencyCount}x per {updatedIdea.frequencyPeriod})
                </>
              )}
            </Typography>

            <TextField
              label="Actual Time Saved (minutes)"
              type="number"
              value={actualTimeSaved}
              onChange={(e) => setActualTimeSaved(e.target.value)}
              fullWidth
              inputProps={{ min: 0 }}
              helperText="Leave blank to keep original estimate"
            />

            {updatedIdea.frequencyCount && updatedIdea.frequencyPeriod && (
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="Actual Frequency"
                  type="number"
                  value={actualFreqCount}
                  onChange={(e) => setActualFreqCount(e.target.value)}
                  sx={{ flex: 1 }}
                  inputProps={{ min: 1 }}
                />
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>Per</InputLabel>
                  <Select
                    value={actualFreqPeriod}
                    label="Per"
                    onChange={(e) => setActualFreqPeriod(e.target.value)}
                  >
                    <MenuItem value="">None</MenuItem>
                    <MenuItem value="day">Per Day</MenuItem>
                    <MenuItem value="week">Per Week</MenuItem>
                    <MenuItem value="month">Per Month</MenuItem>
                    <MenuItem value="year">Per Year</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelComplete} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSkipActualTimeSaved} disabled={saving} variant="outlined">
            Skip (Use Estimate)
          </Button>
          <Button onClick={handleConfirmComplete} disabled={saving} variant="contained">
            Update & Complete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
