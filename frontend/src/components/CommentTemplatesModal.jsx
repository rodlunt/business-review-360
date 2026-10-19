import React, { useState, useEffect } from "react";
import { api } from "../api";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Divider,
  CircularProgress,
} from "@mui/material";
import { Edit, Delete, Add, Close } from "@mui/icons-material";

export default function CommentTemplatesModal({ open, onClose, onTemplatesChange }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get("/comment-templates");
      setTemplates(res.data);
    } catch {
      setError("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTemplates();
      setError("");
      setEditingId(null);
      setShowAddForm(false);
      setNewTitle("");
      setNewContent("");
    }
  }, [open]);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/comment-templates", { title: newTitle.trim(), content: newContent.trim() });
      setNewTitle("");
      setNewContent("");
      setShowAddForm(false);
      await fetchTemplates();
      if (onTemplatesChange) onTemplatesChange();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add template.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (t) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditContent(t.content);
    setError("");
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/comment-templates/${editingId}`, {
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      setEditingId(null);
      await fetchTemplates();
      if (onTemplatesChange) onTemplatesChange();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
    setError("");
    try {
      await api.delete(`/comment-templates/${id}`);
      await fetchTemplates();
      if (onTemplatesChange) onTemplatesChange();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="comment-templates-modal"
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Comment Templates
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : templates.length === 0 && !showAddForm ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No templates yet. Add one below.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {templates.map((t) =>
              editingId === t.id ? (
                <Box
                  key={t.id}
                  sx={{ border: "1px solid", borderColor: "primary.main", borderRadius: 1, p: 1.5 }}
                >
                  <TextField
                    label="Title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    fullWidth
                    size="small"
                    sx={{ mb: 1 }}
                    inputProps={{ maxLength: 100 }}
                    data-testid="edit-template-title"
                  />
                  <TextField
                    label="Content"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    sx={{ mb: 1 }}
                    data-testid="edit-template-content"
                  />
                  <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                    <Button size="small" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSaveEdit}
                      disabled={saving || !editTitle.trim() || !editContent.trim()}
                      data-testid="save-template-edit"
                    >
                      {saving ? <CircularProgress size={14} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box
                  key={t.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 1,
                  }}
                  data-testid="template-row"
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {t.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.content}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleStartEdit(t)}
                      aria-label={`Edit ${t.title}`}
                      data-testid="edit-template-button"
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(t.id)}
                      color="error"
                      aria-label={`Delete ${t.title}`}
                      data-testid="delete-template-button"
                      disabled={saving}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              )
            )}
          </Box>
        )}

        {showAddForm && (
          <>
            {templates.length > 0 && <Divider sx={{ my: 2 }} />}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography variant="body2" fontWeight={600}>
                New template
              </Typography>
              <TextField
                label="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                fullWidth
                size="small"
                placeholder="e.g. Approved"
                inputProps={{ maxLength: 100 }}
                data-testid="new-template-title"
              />
              <TextField
                label="Content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                fullWidth
                multiline
                rows={3}
                size="small"
                placeholder="Thanks for the idea! Approved and scheduled for next quarter."
                data-testid="new-template-content"
              />
              <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewTitle("");
                    setNewContent("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleAdd}
                  disabled={saving || !newTitle.trim() || !newContent.trim()}
                  data-testid="save-new-template"
                >
                  {saving ? <CircularProgress size={14} color="inherit" /> : "Add"}
                </Button>
              </Box>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button
          startIcon={<Add />}
          onClick={() => {
            setShowAddForm(true);
            setEditingId(null);
          }}
          disabled={showAddForm}
          data-testid="show-add-template-form"
          size="small"
        >
          Add Template
        </Button>
        <Button onClick={onClose} size="small">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
