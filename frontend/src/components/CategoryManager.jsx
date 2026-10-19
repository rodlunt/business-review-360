import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  Typography,
  Box,
  Button,
  TextField,
  Alert,
  List,
  ListItem,
  IconButton,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useSnackbar } from "./GlobalSnackbar";

function CategoryManager() {
  const { loading: authLoading } = useAuth();
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { showSnackbar } = useSnackbar();

  const getContrastingTextColor = (bgColor, preferText) => {
    if (preferText) return preferText;
    if (!bgColor || typeof bgColor !== "string") return "#fff";
    try {
      let hex = bgColor.trim();
      if (hex.charAt(0) === "#") hex = hex.slice(1);
      if (hex.length === 3)
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum > 0.6 ? "#222" : "#fff";
    } catch (e) {
      return "#fff";
    }
  };

  const fetchCategories = () => {
    api.get("/categories").then((res) => setCategories(res.data));
  };

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

  useEffect(() => {
    // Wait for auth to be ready before making API calls
    if (authLoading) return;
    fetchCategories();
  }, [authLoading]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await api.post("/categories", { name: newCat });
      setNewCat("");
      fetchCategories();
      setSuccess("Category added successfully.");
      showSnackbar?.("Category added", "success");
    } catch {
      setError("Add failed");
      showSnackbar?.("Failed to add category", "error");
    }
  };

  const handleDelete = async (id) => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/categories/${id}`);
      fetchCategories();
      setSuccess("Category deleted successfully.");
      showSnackbar?.("Category deleted", "success");
    } catch {
      setError("Delete failed");
      showSnackbar?.("Failed to delete category", "error");
    }
  };

  return (
    <Box>
      <Box component="form" onSubmit={handleAdd} sx={{ display: "flex", gap: 2, mb: 2 }}>
        <TextField
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          placeholder="New category"
          required
          size="small"
          sx={{ flex: 1, maxWidth: 400 }}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          sx={{ fontWeight: 600 }}
          aria-label="Add new category"
        >
          Add
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      <Divider sx={{ mb: 1 }} />
      <List dense>
        {categories.map((cat) => (
          <ListItem
            key={cat.id}
            secondaryAction={
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDelete(cat.id)}
                color="secondary"
                size="small"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            }
          >
            <Typography variant="body2">{cat.name}</Typography>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

export default CategoryManager;
