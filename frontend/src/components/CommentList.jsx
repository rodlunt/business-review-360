import React, { useEffect, useState, useContext } from "react";
import { api } from "../api";
import { ThemeContext } from "../contexts";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Alert,
  IconButton,
  Divider,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
} from "@mui/material";
import { ThumbUp, AdminPanelSettings, Person, Edit, Delete, Sort } from "@mui/icons-material";
import FormattingTextField from "./FormattingTextField";
import { validateProfanity } from "../utils/textValidation";

export default function CommentList({ ideaId }) {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [votingInProgress, setVotingInProgress] = useState({});
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [sortOrder, setSortOrder] = useState("votes"); // "votes", "newest", or "oldest"
  const [sortAnchorEl, setSortAnchorEl] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateAnchorEl, setTemplateAnchorEl] = useState(null);
  const theme = useContext(ThemeContext);

  // Auto-dismiss success alert after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchComments = () => {
    api.get(`/comments/idea/${ideaId}`).then((res) => setComments(res.data));
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get("/users/profile");
      setCurrentUser(response.data);
    } catch (err) {
      // User not logged in or error fetching profile
      setCurrentUser(null);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/comment-templates");
      setTemplates(res.data);
    } catch {
      // Non-critical -- silently ignore
    }
  };

  useEffect(() => {
    fetchComments();
    fetchCurrentUser();
  }, [ideaId]);

  // Fetch templates once user context is available (admin only)
  useEffect(() => {
    if (currentUser?.isAdmin) {
      fetchTemplates();
    }
  }, [currentUser?.isAdmin]);

  const handleVote = async (commentId, hasUserVoted) => {
    setError("");
    setSuccess("");
    setVotingInProgress((v) => ({ ...v, [commentId]: true }));
    try {
      if (hasUserVoted) {
        await api.delete(`/comments/${commentId}/upvote`);
        setSuccess("Upvote removed.");
      } else {
        await api.post(`/comments/${commentId}/upvote`);
        setSuccess("Upvoted comment.");
      }
      fetchComments();
    } catch (err) {
      setError("Voting failed");
    }
    setVotingInProgress((v) => ({ ...v, [commentId]: false }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate profanity
    const profanityCheck = validateProfanity(content);
    if (!profanityCheck.isValid) {
      setError(profanityCheck.error);
      return;
    }

    try {
      await api.post(`/comments/idea/${ideaId}`, { content });
      setContent("");
      fetchComments();
      setSuccess("Comment added successfully.");
    } catch (err) {
      setError("Add comment failed");
    }
  };

  const handleEditComment = (comment) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    setError("");
    setSuccess("");

    // Validate profanity
    const profanityCheck = validateProfanity(editContent);
    if (!profanityCheck.isValid) {
      setError(profanityCheck.error);
      return;
    }

    try {
      await api.put(`/comments/${editingComment}`, { content: editContent });
      setEditingComment(null);
      setEditContent("");
      fetchComments();
      setSuccess("Comment updated successfully.");
    } catch (err) {
      setError("Failed to update comment");
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditContent("");
  };

  const handleDeleteComment = (comment) => {
    setCommentToDelete(comment);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteComment = async () => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/comments/${commentToDelete.id}`);
      setDeleteDialogOpen(false);
      setCommentToDelete(null);
      fetchComments();
      setSuccess("Comment deleted successfully.");
    } catch (err) {
      setError("Failed to delete comment");
    }
  };

  const isCommentAuthor = (comment) => {
    return currentUser && comment.author && comment.author.id === currentUser.id;
  };

  const canModerateComment = (comment) => {
    // Users can edit their own comments
    if (isCommentAuthor(comment)) return true;

    // Admins can moderate regular user comments, but NOT other admin comments
    if (currentUser && currentUser.isAdmin) {
      // Don't allow moderation if the comment author is an admin (unless it's their own)
      return !(comment.author?.isAdmin && !isCommentAuthor(comment));
    }

    return false;
  };

  // ...existing code...

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", my: 4 }}>
      <Card
        variant="outlined"
        sx={{
          border: `1px solid #c4c4c4c4`,
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          borderRadius: 3,
          background: theme.backgroundPaper || "#fff",
        }}
      >
        <CardContent>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Comments
            </Typography>
            {comments.length > 0 && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) => setSortAnchorEl(e.currentTarget)}
                  sx={{
                    height: 32,
                    minWidth: 120,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "none",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sortOrder === "votes"
                    ? "By Votes"
                    : sortOrder === "newest"
                      ? "Newest First"
                      : "Oldest First"}{" "}
                  ▼
                </Button>
                <Menu
                  anchorEl={sortAnchorEl}
                  open={Boolean(sortAnchorEl)}
                  onClose={() => setSortAnchorEl(null)}
                >
                  <MenuItem
                    onClick={() => {
                      setSortOrder("votes");
                      setSortAnchorEl(null);
                    }}
                  >
                    By Votes
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setSortOrder("newest");
                      setSortAnchorEl(null);
                    }}
                  >
                    Newest First
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setSortOrder("oldest");
                      setSortAnchorEl(null);
                    }}
                  >
                    Oldest First
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
          {comments.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontStyle: "italic" }}
              data-testid="no-comments-message"
            >
              No comments yet
            </Typography>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}
          <Box sx={{ mb: 3 }}>
            {[...comments]
              .sort((a, b) => {
                if (sortOrder === "votes") {
                  // Sort by votes (descending), then by date (oldest first for same votes)
                  const voteDiff = (b.votes?.length || 0) - (a.votes?.length || 0);
                  if (voteDiff !== 0) return voteDiff;
                  return new Date(a.createdAt) - new Date(b.createdAt);
                } else if (sortOrder === "newest") {
                  // Sort by date (newest first)
                  return new Date(b.createdAt) - new Date(a.createdAt);
                } else {
                  // Sort by date (oldest first)
                  return new Date(a.createdAt) - new Date(b.createdAt);
                }
              })
              .map((c, idx) => {
                const upvoteCount = c.votes?.length || 0;
                const hasUserVoted = c.userVoted;
                return (
                  <Box
                    key={c.id}
                    sx={{ display: "flex", gap: 2, pb: 2 }}
                    data-testid="comment-item"
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        pt: 0.5,
                      }}
                    >
                      <IconButton
                        onClick={() => handleVote(c.id, hasUserVoted)}
                        title={hasUserVoted ? "Remove upvote" : "Upvote this comment"}
                        size="small"
                        aria-label={
                          hasUserVoted ? "Remove upvote from comment" : "Upvote this comment"
                        }
                        disabled={votingInProgress[c.id]}
                        sx={{
                          color: hasUserVoted ? "primary.main" : "text.secondary",
                          "&:hover": {
                            color: hasUserVoted ? "primary.dark" : "primary.main",
                            backgroundColor: hasUserVoted ? "action.hover" : "action.hover",
                          },
                        }}
                        data-testid="comment-upvote-button"
                      >
                        <ThumbUp fontSize="small" />
                      </IconButton>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          mt: 1,
                          color: upvoteCount > 0 ? theme.primaryColor : "text.secondary",
                        }}
                        data-testid="comment-upvotes"
                      >
                        {upvoteCount}
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
                          {c.author?.isSuperuser ? (
                            <Avatar
                              sx={{
                                width: { xs: 20, sm: 32 },
                                height: { xs: 20, sm: 32 },
                                bgcolor: "#B8860B",
                              }}
                            >
                              <AdminPanelSettings sx={{ fontSize: 12 }} />
                            </Avatar>
                          ) : c.author?.isAdmin ? (
                            <Avatar
                              sx={{
                                width: { xs: 20, sm: 32 },
                                height: { xs: 20, sm: 32 },
                                bgcolor: "#1565c0",
                              }}
                            >
                              <AdminPanelSettings sx={{ fontSize: 12 }} />
                            </Avatar>
                          ) : (
                            <Avatar
                              sx={{
                                width: { xs: 20, sm: 32 },
                                height: { xs: 20, sm: 32 },
                                bgcolor: "grey.400",
                              }}
                            >
                              <Person sx={{ fontSize: 12 }} />
                            </Avatar>
                          )}
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 600,
                              color:
                                c.author?.isAdmin
                                  ? "primary.main"
                                  : "text.primary",
                            }}
                            data-testid="comment-author"
                          >
                            {c.author?.displayName || c.author?.username || "Former member"}
                            {(c.author?.isAdmin) && " (Admin)"}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            data-testid="comment-timestamp"
                          >
                            {new Date(c.createdAt).toLocaleDateString()}
                          </Typography>
                          {c.isEdited && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              data-testid="edited-indicator"
                            >
                              (edited)
                            </Typography>
                          )}
                          {upvoteCount > 2 && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: theme.primaryColor,
                                bgcolor: "green.50",
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                fontWeight: 600,
                              }}
                              data-testid="top-comment-label"
                            >
                              Top comment
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      {editingComment === c.id ? (
                        <Box sx={{ mt: 1 }}>
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            variant="outlined"
                            size="small"
                            inputProps={{ "data-testid": "edit-comment-input" }}
                            sx={{ mb: 1 }}
                          />
                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={handleSaveEdit}
                              disabled={!editContent.trim()}
                              data-testid="save-comment-button"
                            >
                              Save
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={handleCancelEdit}
                              data-testid="cancel-edit-button"
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
                            data-testid="comment-content"
                          >
                            {c.content}
                          </Typography>
                          {canModerateComment(c) && (
                            <Box
                              sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, mt: 1 }}
                            >
                              <IconButton
                                size="small"
                                onClick={() => handleEditComment(c)}
                                data-testid="edit-comment-button"
                                title={
                                  currentUser?.isAdmin && !isCommentAuthor(c)
                                    ? "Moderate comment (Admin)"
                                    : "Edit comment"
                                }
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteComment(c)}
                                data-testid="delete-comment-button"
                                title={
                                  currentUser?.isAdmin && !isCommentAuthor(c)
                                    ? "Delete comment (Admin)"
                                    : "Delete comment"
                                }
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  </Box>
                );
              })}
          </Box>
          <Divider />
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="Add a comment"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              variant="outlined"
              size="small"
              sx={{ mb: 2 }}
              required
              data-testid="comment-input"
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {/* Template picker -- admin only, Issue #525 */}
              {currentUser?.isAdmin && templates.length > 0 ? (
                <>
                  <Button
                    size="small"
                    variant="text"
                    onClick={(e) => setTemplateAnchorEl(e.currentTarget)}
                    data-testid="template-picker-button"
                    sx={{ fontSize: "0.75rem", textTransform: "none", color: "text.secondary" }}
                  >
                    Templates ▾
                  </Button>
                  <Menu
                    anchorEl={templateAnchorEl}
                    open={Boolean(templateAnchorEl)}
                    onClose={() => setTemplateAnchorEl(null)}
                  >
                    {templates.map((t) => (
                      <MenuItem
                        key={t.id}
                        onClick={() => {
                          setContent(t.content);
                          setTemplateAnchorEl(null);
                        }}
                        data-testid="template-menu-item"
                      >
                        {t.title}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              ) : (
                <Box />
              )}

              <Button
                type="submit"
                variant="outlined"
                disabled={!content.trim()}
                sx={{
                  color: content.trim() ? "white" : "text.primary",
                  border: content.trim() ? "1px solid" : "1px solid #c4c4c4c4 !important",
                  borderColor: content.trim() ? "primary.main" : undefined,
                  backgroundColor: content.trim() ? "primary.main" : "transparent",
                  borderRadius: 1,
                  height: 32,
                  fontSize: "0.875rem",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  px: 3,
                  "&:hover": {
                    backgroundColor: content.trim() ? "primary.dark" : "#e0e0e0",
                    borderColor: content.trim() ? "primary.dark" : "#b0b0b0",
                    color: content.trim() ? "white" : "text.primary",
                  },
                  "&:disabled": {
                    color: "text.secondary",
                    borderColor: "#fcfcfc",
                    backgroundColor: "transparent",
                  },
                }}
                aria-label="Add comment"
                data-testid="submit-comment-button"
              >
                COMMENT
              </Button>
            </Box>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        data-testid="delete-comment-modal"
      >
        <DialogTitle>Delete Comment</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this comment? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={confirmDeleteComment}
            color="error"
            variant="contained"
            data-testid="confirm-delete-comment"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
