import React, { useEffect, useState, useContext, useRef } from "react";
import {
  Box,
  Alert,
  IconButton,
  Tooltip,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { Close, ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import { api } from "../api";
const IdeaView = React.lazy(() => import("./IdeaView"));
import IdeaCard from "./core/IdeaCard";
import FilterBar from "./core/FilterBar";
import { ThemeContext } from "../contexts";
import { useAuth } from "../auth";

// Simple Dropdown Component
function Dropdown({ trigger, children, isOpen, onToggle }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onToggle(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, onToggle]);

  return (
    <div className="dropdown-wrapper" ref={dropdownRef}>
      <div onClick={() => onToggle(!isOpen)}>{trigger}</div>
      {isOpen && <div className="dropdown-content">{children}</div>}
    </div>
  );
}

export default function IdeaList({
  refresh,
  ideas: propIdeas,
  onRefresh,
  featured,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  loading = false,
  totalCount,
  externalFilters,
  onFiltersChange,
}) {
  const isControlled = !!externalFilters;

  const [ideas, setIdeas] = useState(propIdeas || []);
  useEffect(() => {
    setIdeas(propIdeas || []);
  }, [propIdeas]);
  const [categories, setCategories] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [error, setError] = useState("");
  const [_sort, _setSort] = useState("trending");
  const [_selectedCategory, _setSelectedCategory] = useState("all");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [_showMyIdeas, _setShowMyIdeas] = useState(false);
  const [_selectedStatus, _setSelectedStatus] = useState("all");

  const sort = isControlled ? externalFilters.sort || "trending" : _sort;
  const selectedCategory = isControlled ? externalFilters.category || "all" : _selectedCategory;
  const selectedStatus = isControlled ? externalFilters.status || "all" : _selectedStatus;
  const showMyIdeas = isControlled ? (externalFilters.showMyIdeas ?? false) : _showMyIdeas;

  const setSort = isControlled
    ? (v) => onFiltersChange((prev) => ({ ...prev, sort: v }))
    : _setSort;
  const setSelectedCategory = isControlled
    ? (v) => onFiltersChange((prev) => ({ ...prev, category: v }))
    : _setSelectedCategory;
  const setSelectedStatus = isControlled
    ? (v) => onFiltersChange((prev) => ({ ...prev, status: v }))
    : _setSelectedStatus;
  const setShowMyIdeas = isControlled
    ? (v) => onFiltersChange((prev) => ({ ...prev, showMyIdeas: v }))
    : _setShowMyIdeas;
  const theme = useContext(ThemeContext);
  const navigate = useNavigate();
  const orgId = useOrganizationId();
  const { user } = useAuth();
  const [votingError, setVotingError] = useState("");
  const scrollPositionRef = useRef(0);
  const preserveScrollRef = useRef(false);

  // Fetch dynamic categories from database
  useEffect(() => {
    // Don't fetch categories if user is not authenticated
    if (!user) {
      console.log("[Categories] Waiting for authentication...");
      return;
    }

    const fetchCategories = async (retryCount = 0) => {
      try {
        console.log("[Categories] Fetching categories, attempt:", retryCount + 1);
        console.log("[Categories] User organizationId:", user?.organizationId);
        const res = await api.get("/categories");
        console.log("[Categories] Raw response:", res);
        const fetchedCats = Array.isArray(res.data) ? res.data : [];

        // Sort categories alphabetically and set them directly
        const sortedCategories = fetchedCats.sort((a, b) => a.name.localeCompare(b.name));
        console.log(
          "[Categories] Successfully fetched",
          sortedCategories.length,
          "categories:",
          sortedCategories.map((c) => c.name)
        );
        setCategories(sortedCategories);
        setDynamicCategories(sortedCategories); // Keep for backward compatibility
      } catch (error) {
        console.error("[Categories] Error on attempt", retryCount + 1, ":", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        // Only log error on final retry attempt
        if (retryCount >= 2) {
          console.error("Failed to fetch categories after retries:", error.message);
          setCategories([]); // Empty categories on failure
        } else {
          // Retry with exponential backoff
          setTimeout(
            () => {
              fetchCategories(retryCount + 1);
            },
            (retryCount + 1) * 1000
          );
        }
      }
    };
    fetchCategories();
  }, [refresh, user]); // Add user as dependency to refetch when user logs in

  // Extract unique statuses from ideas, filter out "Hidden" for non-admins
  const statuses = Array.isArray(ideas)
    ? [...new Set(ideas.map((idea) => idea.status).filter(Boolean))].filter(
        (status) => user?.isAdmin || status !== "Hidden"
      )
    : [];

  // Make sure ideas is an array before attempting to filter and sort
  const filteredAndSortedIdeas = Array.isArray(ideas)
    ? [...ideas]
        // Apply category filter
        .filter((idea) => selectedCategory === "all" || idea.category === selectedCategory)
        // Apply status filter
        .filter((idea) => selectedStatus === "all" || idea.status === selectedStatus)
        // Apply My Ideas filter
        .filter((idea) => !showMyIdeas || idea.authorId === user?.id)
        // Apply sorting with pinned ideas always first
        .sort((a, b) => {
          // Always prioritize pinned ideas first
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;

          // If both have same pin status, apply normal sorting
          if (sort === "popular") return (b.votes?.length || 0) - (a.votes?.length || 0);
          if (sort === "trending") return (b.trendingScore || 0) - (a.trendingScore || 0);
          if (sort === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
          if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
          return 0;
        })
    : [];

  // Preserve scroll position when sort order changes
  useEffect(() => {
    // Save scroll position before sort changes
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY || window.pageYOffset;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore scroll position after sort changes (but not on initial load)
  useEffect(() => {
    if (preserveScrollRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        window.scrollTo({
          top: scrollPositionRef.current,
          behavior: "instant", // No smooth scrolling, instant jump
        });
        preserveScrollRef.current = false;
      }, 0);
    } else {
      // After first render, start preserving scroll on sort changes
      preserveScrollRef.current = true;
    }
  }, [sort]);

  const isAdmin = !!user?.isAdmin;

  if (loading && ideas.length === 0)
    return (
      <Box sx={{ p: 4 }} aria-label="Loading ideas" aria-live="polite">
        Loading...
      </Box>
    );

  const paginatedIdeas = filteredAndSortedIdeas;

  // Handle voting on ideas with optimistic UI update
  const handleVote = async (ideaId) => {
    if (!user) {
      setVotingError("Please log in to vote");
      return;
    }

    try {
      setVotingError("");
      // Check if user has already voted
      const idea = ideas.find((i) => i.id === ideaId);
      const userHasVoted = idea?.votes?.some((vote) => vote.userId === user.id);

      // Optimistically update the UI immediately
      const updatedIdeas = ideas.map((i) => {
        if (i.id === ideaId) {
          const newVotes = userHasVoted
            ? i.votes.filter((vote) => vote.userId !== user.id) // Remove vote
            : [...(i.votes || []), { userId: user.id, createdAt: new Date() }]; // Add vote

          return { ...i, votes: newVotes };
        }
        return i;
      });

      setIdeas(updatedIdeas);

      // Make the API call in the background
      if (userHasVoted) {
        await api.delete(`/votes/idea/${ideaId}`);
      } else {
        await api.post(`/votes/idea/${ideaId}`);
      }
    } catch (err) {
      console.error("Error voting:", err);
      setVotingError("Failed to vote. Please try again.");

      // Revert optimistic update on error
      if (onRefresh) {
        onRefresh();
      }
    }
  };

  // Handle status change for admins
  const handleStatusChange = async (ideaId, newStatus) => {
    try {
      // Save current scroll position before updating
      const currentScroll = window.scrollY || window.pageYOffset;

      await api.patch(`/ideas/${ideaId}/admin`, { status: newStatus });

      // Update local state
      setIdeas(ideas.map((idea) => (idea.id === ideaId ? { ...idea, status: newStatus } : idea)));

      // Restore scroll position after state update
      setTimeout(() => {
        window.scrollTo({
          top: currentScroll,
          behavior: "instant",
        });
      }, 0);

      // Refresh ideas if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error changing status:", err);
      setError("Failed to change status. Please try again.");
    }
  };

  return (
    <Box aria-label="Idea list" sx={{ px: 0 }}>
      {/* If an idea is selected, show the details view */}
      {selectedIdea ? (
        <Box sx={{ position: "relative", maxWidth: 800, mx: "auto" }}>
          {/* Close button - visible on all screen sizes */}
          <Box
            sx={{
              position: "absolute",
              top: 24,
              right: 24,
              zIndex: 10,
              display: "flex",
              gap: 1,
            }}
          >
            <Tooltip title="Back to ideas list" arrow placement="left">
              <IconButton
                onClick={() => setSelectedIdea(null)}
                size="medium"
                sx={{
                  backgroundColor: "background.paper",
                  boxShadow: 2,
                  border: 1,
                  borderColor: "divider",
                  "&:hover": {
                    backgroundColor: "grey.100",
                    boxShadow: 3,
                  },
                  width: 40,
                  height: 40,
                }}
                aria-label="Close idea details and return to list"
              >
                <Close sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <React.Suspense fallback={null}>
            <IdeaView idea={selectedIdea} />
          </React.Suspense>
        </Box>
      ) : (
        <>
          <FilterBar
            sort={sort}
            setSort={setSort}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            categories={categories}
            showMyIdeas={showMyIdeas}
            setShowMyIdeas={setShowMyIdeas}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            statuses={statuses}
            isAdmin={isAdmin}
          />
          <Box sx={{ mt: 2 }} aria-live="polite">
            {error && <Alert severity="error">{error}</Alert>}
            {votingError && (
              <Alert severity="error" data-testid="vote-error">
                {votingError}
              </Alert>
            )}
            {filteredAndSortedIdeas.length === 0 && !error && (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  No ideas match the current filters
                </Alert>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 1.5,
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    variant="outlined"
                    onClick={() => navigate(-1)}
                    startIcon={<ArrowBack />}
                    sx={{ height: 32 }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setSort("trending");
                      setSelectedCategory("all");
                      setSelectedStatus("all");
                      setShowMyIdeas(false);
                    }}
                    sx={{
                      height: 32,
                      color: "error.main",
                      borderColor: "error.main",
                      "&:hover": {
                        borderColor: "error.dark",
                        backgroundColor: "error.lighter",
                      },
                    }}
                  >
                    Clear All
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "16px",
              marginTop: "16px",
              mb: 2,
            }}
            aria-label="Ideas grid"
            data-testid="idea-list"
          >
            {paginatedIdeas.map((idea) => {
              return (
                <Box
                  key={idea.id}
                  tabIndex={0}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 1,
                  }}
                  onClick={() => {
                    const storedOrgId = orgId || localStorage.getItem("organizationId");
                    navigate(orgPath(storedOrgId, `idea/${idea.slug || idea.id}`));
                  }}
                >
                  <IdeaCard
                    idea={idea}
                    onCategoryClick={(category) => {
                      setSelectedCategory(category);
                      setShowMyIdeas(false); // Reset other filters for clarity
                    }}
                    onVote={handleVote}
                    userVoted={idea?.votes?.some((vote) => vote.userId === user?.id)}
                    isAdmin={user?.isAdmin}
                    onStatusChange={handleStatusChange}
                    onStatusFilter={(status) => {
                      setSelectedStatus(status);
                    }}
                  />
                </Box>
              );
            })}
          </Box>

          {/* Load more footer */}
          {(hasMore || isLoadingMore || ideas.length > 0) && (
            <Box
              sx={{
                mt: 3,
                mb: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              {totalCount !== undefined && (
                <Typography variant="body2" color="text.secondary">
                  Showing {ideas.length} of {totalCount}
                </Typography>
              )}
              {error && (
                <Alert severity="error" sx={{ width: "100%", maxWidth: 400 }}>
                  {error}
                  <Button size="small" onClick={() => setError("")} sx={{ ml: 1 }}>
                    Dismiss
                  </Button>
                </Alert>
              )}
              {hasMore && (
                <Button
                  variant="outlined"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  startIcon={isLoadingMore ? <CircularProgress size={16} /> : null}
                  data-testid="load-more-button"
                >
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
