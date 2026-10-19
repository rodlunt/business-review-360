import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Card,
  CardContent,
  Typography,
  Badge,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
} from "@mui/material";
import {
  ChatBubbleOutlined,
  ThumbUp,
  Circle,
  Person,
  AdminPanelSettings,
  Timer,
} from "@mui/icons-material";
import { getStatusColors } from "../../utils/statusColors";

export default function IdeaCard({
  idea,
  children,
  sx,
  onCategoryClick,
  onVote,
  userVoted = false,
  isAdmin = false,
  onStatusChange,
}) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);
  const dotRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
    };

    if (showStatusDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showStatusDropdown]);

  // Auto-close dropdown after 4 seconds
  useEffect(() => {
    if (showStatusDropdown) {
      const timer = setTimeout(() => {
        setShowStatusDropdown(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [showStatusDropdown]);

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

  // Helper function to get status color
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

  // Helper function to get status description for tooltip
  const getStatusDescription = (status) => {
    switch (status?.toLowerCase()) {
      case "in progress":
        return "This idea is currently being implemented";
      case "approved":
        return "This idea has been approved for implementation";
      case "reviewing":
        return "This idea is currently being reviewed by the team";
      case "complete":
        return "This idea has been successfully implemented and completed";
      case "rejected":
        return "This idea has been reviewed and rejected";
      case "duplicate":
        return "This idea is a duplicate of another submission";
      case "hidden":
        return "This idea is hidden from non-admin users";
      case "open":
        return "This idea is open for review";
      default:
        return `Status: ${status || "Unknown"}`;
    }
  };

  const handleStatusClick = (e) => {
    if (isAdmin) {
      e.stopPropagation();
      if (dotRef.current) {
        const rect = dotRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.right + window.scrollX - 140, // Align right edge
        });
      }
      setShowStatusDropdown(!showStatusDropdown);
    }
  };

  const handleStatusSelect = (e, newStatus) => {
    e.stopPropagation();
    if (onStatusChange) {
      onStatusChange(idea.id, newStatus);
    }
    setShowStatusDropdown(false);
  };

  return (
    <Card
      data-testid="idea-card"
      sx={{
        borderRadius: 4,
        boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
        background: "#fff",
        mb: 0,
        height: 205, // Expanded height for better content visibility
        display: "flex",
        flexDirection: "column",
        ...sx,
      }}
    >
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        {/* Top Row: Title and Status Icons */}
        <Box
          sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}
        >
          <Typography
            variant="h6"
            component="h2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
              flexGrow: 1,
              minWidth: 0,
              pr: 1,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {idea.title}
          </Typography>

          {/* Status Icons */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            {/* Comments Count */}
            <Tooltip
              title={`${idea.comments?.length || 0} comment${(idea.comments?.length || 0) !== 1 ? "s" : ""}`}
              placement="top"
              arrow
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, cursor: "help" }}>
                <ChatBubbleOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary">
                  {idea.comments?.length || 0}
                </Typography>
              </Box>
            </Tooltip>

            {/* Upvotes Count */}
            <Tooltip
              title={`${idea.votes?.length || 0} upvote${(idea.votes?.length || 0) !== 1 ? "s" : ""}`}
              placement="top"
              arrow
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.3,
                  ml: 1,
                  cursor: onVote ? "pointer" : "default",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onVote) onVote(idea.id);
                }}
                data-testid="upvote-button"
              >
                <ThumbUp
                  sx={{
                    fontSize: 16,
                    color: userVoted ? "primary.main" : "text.secondary",
                    transition: "color 0.2s ease",
                    "&:hover": {
                      color: "primary.main",
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  color={userVoted ? "primary.main" : "text.secondary"}
                  data-testid="vote-count"
                  sx={{
                    transition: "color 0.2s ease",
                  }}
                >
                  {idea.votes?.length || 0}
                </Typography>
              </Box>
            </Tooltip>

            {/* Status Indicator */}
            {isAdmin ? (
              <>
                <Box ref={dotRef} sx={{ ml: 1 }}>
                  <Tooltip
                    title={`Click to change status: ${idea.status || "Open"}`}
                    placement="top"
                    arrow
                  >
                    <Circle
                      onClick={handleStatusClick}
                      sx={{
                        fontSize: 12,
                        color:
                          getStatusColor(idea.status) === "success"
                            ? "success.main"
                            : getStatusColor(idea.status) === "warning"
                              ? "warning.main"
                              : getStatusColor(idea.status) === "error"
                                ? "error.main"
                                : "grey.400",
                        cursor: "pointer",
                        "&:hover": {
                          transform: "scale(1.2)",
                          transition: "transform 0.2s",
                        },
                      }}
                    />
                  </Tooltip>
                </Box>
                {showStatusDropdown &&
                  ReactDOM.createPortal(
                    <Box
                      ref={dropdownRef}
                      sx={{
                        position: "fixed",
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        bgcolor: "background.paper",
                        boxShadow: 3,
                        borderRadius: 1,
                        zIndex: 9999,
                        minWidth: 140,
                        maxHeight: 300,
                        overflowY: "auto",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {statusOptions.map((status) => (
                        <Box
                          key={status}
                          onClick={(e) => handleStatusSelect(e, status)}
                          sx={{
                            px: 2,
                            py: 1,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            backgroundColor: `${getStatusColors(status).bg} !important`,
                            color: getStatusColors(status).text,
                            fontWeight: 500,
                            "&:hover": {
                              opacity: 0.85,
                            },
                            fontSize: "0.875rem",
                          }}
                        >
                          <Circle
                            sx={{
                              fontSize: 8,
                              color: getStatusColors(status).dot,
                            }}
                          />
                          {status}
                        </Box>
                      ))}
                    </Box>,
                    document.body
                  )}
              </>
            ) : (
              <Tooltip title={getStatusDescription(idea.status)} placement="top" arrow>
                <Circle
                  sx={{
                    fontSize: 12,
                    color:
                      getStatusColor(idea.status) === "success"
                        ? "success.main"
                        : getStatusColor(idea.status) === "warning"
                          ? "warning.main"
                          : getStatusColor(idea.status) === "error"
                            ? "error.main"
                            : "grey.400",
                    ml: 1,
                    cursor: "help",
                  }}
                />
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Description */}
        <Box sx={{ position: "relative", flex: 1 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              lineHeight: 1.5,
              position: "relative",
            }}
          >
            {idea.description}
          </Typography>
          {/* Fade effect overlay for long descriptions */}
          {idea.description && idea.description.length > 120 && (
            <Box
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "1.2em",
                background: "linear-gradient(transparent, #fff)",
                pointerEvents: "none",
              }}
            />
          )}
        </Box>

        {/* Bottom Section: Category & Admin Badge Row, then Author Row */}
        <Box sx={{ mt: 1.5 }}>
          {/* Top row: Category and Admin Requesting Input chips */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
            {idea.category && (
              <Chip
                label={idea.category}
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCategoryClick) {
                    onCategoryClick(idea.category);
                  }
                }}
                sx={{
                  borderRadius: 1,
                  backgroundColor: "primary.50",
                  borderColor: "primary.200",
                  color: "primary.700",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  cursor: onCategoryClick ? "pointer" : "default",
                  height: "24px",
                  "&:hover": onCategoryClick
                    ? {
                        backgroundColor: "primary.100",
                        borderColor: "primary.300",
                      }
                    : {},
                }}
              />
            )}
            {idea.timeSavedMinutes && (
              <Tooltip
                title={`Saves ${idea.timeSavedMinutes} minute${idea.timeSavedMinutes !== 1 ? "s" : ""} per instance`}
                arrow
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.3,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    backgroundColor: "success.50",
                    border: "1px solid",
                    borderColor: "success.200",
                    height: "24px",
                  }}
                >
                  <Timer sx={{ fontSize: 12, color: "success.700" }} />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.70rem", fontWeight: 500, color: "success.700" }}
                  >
                    {idea.timeSavedMinutes}m
                  </Typography>
                </Box>
              </Tooltip>
            )}
            {idea.isPinned && (
              <Chip
                label="Admin requesting input"
                size="small"
                sx={{
                  borderRadius: 1,
                  backgroundColor: "#fff9e6",
                  borderColor: "#f5c842",
                  color: "#8b5a00",
                  fontWeight: 500,
                  fontSize: "0.70rem",
                  border: "1px solid",
                  height: "24px",
                }}
              />
            )}
          </Box>

          {/* Bottom row: Author info */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {idea.authorId === "anonymous" || idea.author?.isAnonymous ? (
              <>
                <Person sx={{ fontSize: 14, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary">
                  Anonymous
                </Typography>
              </>
            ) : (
              <>
                {idea.isSuperuserAuthor || idea.author?.isSuperuser ? (
                  <AdminPanelSettings sx={{ fontSize: 14, color: "#B8860B" }} />
                ) : idea.isAdminAuthor || idea.author?.isAdmin ? (
                  <AdminPanelSettings sx={{ fontSize: 14, color: "#1565c0" }} />
                ) : (
                  <Person sx={{ fontSize: 14, color: "text.secondary" }} />
                )}
                <Typography
                  variant="caption"
                  color={
                    idea.isSuperuserAuthor || idea.author?.isSuperuser
                      ? "#B8860B"
                      : idea.isAdminAuthor || idea.author?.isAdmin
                        ? "#1565c0"
                        : "text.secondary"
                  }
                  sx={{
                    fontWeight:
                      idea.isAdminAuthor ||
                      idea.author?.isAdmin ||
                      idea.isSuperuserAuthor ||
                      idea.author?.isSuperuser
                        ? 600
                        : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {idea.authorName || idea.author?.username || "User"}
                  {(idea.isSuperuserAuthor || idea.author?.isSuperuser) && " (Superuser)"}
                  {!idea.isSuperuserAuthor &&
                    !idea.author?.isSuperuser &&
                    (idea.isAdminAuthor || idea.author?.isAdmin) &&
                    " (Admin)"}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* Additional content from children */}
        {children}
      </CardContent>

      {/* Footer if provided */}
      {idea.footer && (
        <Box sx={{ borderTop: "1px solid #eee", pt: 2, mt: 2, px: 2, pb: 2 }}>{idea.footer}</Box>
      )}
    </Card>
  );
}
