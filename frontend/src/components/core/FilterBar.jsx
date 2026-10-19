import React from "react";
import {
  Box,
  Button,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Collapse,
  Divider,
} from "@mui/material";
import { FilterList, ExpandMore, ExpandLess } from "@mui/icons-material";
import { getStatusColors } from "../../utils/statusColors";

export default function FilterBar({
  sort,
  setSort,
  selectedCategory,
  setSelectedCategory,
  categories,
  showMyIdeas,
  setShowMyIdeas,
  selectedStatus,
  setSelectedStatus,
  statuses,
  itemsPerPage = 8,
  onItemsPerPageChange,
  isAdmin = false,
}) {
  const [sortAnchorEl, setSortAnchorEl] = React.useState(null);
  const [catAnchorEl, setCatAnchorEl] = React.useState(null);
  const [statusAnchorEl, setStatusAnchorEl] = React.useState(null);
  const [itemsAnchorEl, setItemsAnchorEl] = React.useState(null);
  const [filtersExpanded, setFiltersExpanded] = React.useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isInfiniteScrollActive = useMediaQuery("(max-width:900px)"); // 900px matches IdeaList mobile breakpoint
  const shouldTruncateCategory = useMediaQuery("(min-width:601px) and (max-width:900px)"); // Truncate between tablet and desktop

  // Get display text for sort button
  const getSortLabel = () => {
    if (sort === "oldest" && selectedStatus === "Reviewing") return "Stale";
    switch (sort) {
      case "trending":
        return "Trending";
      case "popular":
        return "Most Popular";
      case "newest":
        return "Newest First";
      case "oldest":
        return "Oldest First";
      default:
        return "Trending";
    }
  };

  // Get display text for items per page button
  const getItemsLabel = () => {
    return itemsPerPage >= 9999 ? "All" : itemsPerPage;
  };

  // Get display text for category button
  const getCategoryLabel = () => {
    return selectedCategory === "all" ? "Category" : selectedCategory;
  };

  // Count active filters for mobile badge
  const activeFilterCount = [
    sort !== "trending" ? 1 : 0,
    selectedCategory !== "all" ? 1 : 0,
    selectedStatus !== "all" ? 1 : 0,
    showMyIdeas ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Clear all filters
  const handleClearAll = () => {
    setSort("trending");
    setSelectedCategory("all");
    setSelectedStatus("all");
    setShowMyIdeas(false);
  };

  // Check if any filters are active
  const hasActiveFilters =
    sort !== "trending" || selectedCategory !== "all" || selectedStatus !== "all" || showMyIdeas;

  const buttonStyles = {
    height: 32,
    minWidth: 90,
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "none",
    px: 2,
    borderRadius: 1,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  };

  // Mobile collapsible view
  if (isMobile) {
    return (
      <Box sx={{ mb: 2, width: "100%", textAlign: "center" }}>
        {/* Filter Toggle - Outlined Button Style */}
        <Box
          data-testid="mobile-filter-toggle"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            cursor: "pointer",
            color: "primary.main",
            fontSize: "0.8rem",
            fontWeight: 600,
            mb: 1,
            px: 2,
            py: 0.5,
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            "&:hover": {
              backgroundColor: "rgba(25, 118, 210, 0.04)",
            },
          }}
        >
          <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
          {filtersExpanded ? (
            <ExpandLess sx={{ fontSize: 18 }} />
          ) : (
            <ExpandMore sx={{ fontSize: 18 }} />
          )}
        </Box>

        {/* Collapsible Filter Content */}
        <Collapse in={filtersExpanded}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              p: 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              backgroundColor: "background.paper",
              mt: 1,
            }}
          >
            <Button
              data-testid="sort-button-mobile"
              variant="outlined"
              onClick={(e) => setSortAnchorEl(e.currentTarget)}
              size="small"
              fullWidth
              sx={buttonStyles}
            >
              {getSortLabel()} ▼
            </Button>
            <Menu
              anchorEl={sortAnchorEl}
              open={Boolean(sortAnchorEl)}
              onClose={() => setSortAnchorEl(null)}
            >
              <MenuItem
                data-testid="sort-trending-mobile"
                onClick={() => {
                  setSort("trending");
                  setSortAnchorEl(null);
                }}
              >
                Trending
              </MenuItem>
              <MenuItem
                data-testid="sort-popular-mobile"
                onClick={() => {
                  setSort("popular");
                  setSortAnchorEl(null);
                }}
              >
                Most Popular
              </MenuItem>
              <MenuItem
                data-testid="sort-newest-mobile"
                onClick={() => {
                  setSort("newest");
                  setSortAnchorEl(null);
                }}
              >
                Newest First
              </MenuItem>
              <MenuItem
                data-testid="sort-oldest-mobile"
                onClick={() => {
                  setSort("oldest");
                  setSortAnchorEl(null);
                }}
              >
                Oldest First
              </MenuItem>
              {isAdmin && (
                <MenuItem
                  data-testid="sort-stale-mobile"
                  onClick={() => {
                    setSort("oldest");
                    setSelectedStatus("Reviewing");
                    setSortAnchorEl(null);
                  }}
                >
                  Stale
                </MenuItem>
              )}
            </Menu>

            <Divider sx={{ my: 0.5 }} />

            <Button
              data-testid="category-button-mobile"
              variant="outlined"
              onClick={(e) => setCatAnchorEl(e.currentTarget)}
              size="small"
              fullWidth
              sx={buttonStyles}
            >
              {getCategoryLabel()} ▼
            </Button>
            <Menu
              anchorEl={catAnchorEl}
              open={Boolean(catAnchorEl)}
              onClose={() => setCatAnchorEl(null)}
            >
              <MenuItem
                data-testid="category-all-mobile"
                onClick={() => {
                  setSelectedCategory("all");
                  setCatAnchorEl(null);
                }}
              >
                All Categories
              </MenuItem>
              {categories &&
                categories.map((cat) => (
                  <MenuItem
                    key={cat.id || cat.name}
                    data-testid={`category-${cat.name.toLowerCase().replace(/\s+/g, "-")}-mobile`}
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      setCatAnchorEl(null);
                    }}
                  >
                    {cat.name}
                  </MenuItem>
                ))}
            </Menu>

            <Button
              data-testid="status-button-mobile"
              variant="outlined"
              onClick={(e) => setStatusAnchorEl(e.currentTarget)}
              size="small"
              fullWidth
              sx={buttonStyles}
            >
              {selectedStatus === "all" ? "Status" : selectedStatus} ▼
            </Button>
            <Menu
              anchorEl={statusAnchorEl}
              open={Boolean(statusAnchorEl)}
              onClose={() => setStatusAnchorEl(null)}
            >
              <MenuItem
                data-testid="status-all-mobile"
                onClick={() => {
                  setSelectedStatus("all");
                  setStatusAnchorEl(null);
                }}
              >
                All
              </MenuItem>
              {statuses &&
                statuses.map((status) => (
                  <MenuItem
                    key={status}
                    data-testid={`status-${status.toLowerCase().replace(/\s+/g, "-")}-mobile`}
                    onClick={() => {
                      setSelectedStatus(status);
                      setStatusAnchorEl(null);
                    }}
                    sx={{
                      backgroundColor: getStatusColors(status).bg,
                      borderLeft: `4px solid ${getStatusColors(status).border}`,
                      color: getStatusColors(status).text,
                      fontWeight: 500,
                      "&:hover": {
                        backgroundColor: getStatusColors(status).bg,
                        opacity: 0.8,
                      },
                    }}
                  >
                    {status}
                  </MenuItem>
                ))}
            </Menu>

            <Divider sx={{ my: 0.5 }} />

            <Button
              data-testid="my-ideas-button-mobile"
              variant={showMyIdeas ? "contained" : "outlined"}
              onClick={() => setShowMyIdeas(!showMyIdeas)}
              size="small"
              fullWidth
              sx={buttonStyles}
            >
              My Ideas
            </Button>

            {onItemsPerPageChange && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Button
                  data-testid="items-per-page-button-mobile"
                  variant="outlined"
                  onClick={(e) => setItemsAnchorEl(e.currentTarget)}
                  size="small"
                  fullWidth
                  sx={buttonStyles}
                >
                  Show: {getItemsLabel()} ▼
                </Button>
                <Menu
                  anchorEl={itemsAnchorEl}
                  open={Boolean(itemsAnchorEl)}
                  onClose={() => setItemsAnchorEl(null)}
                >
                  <MenuItem
                    data-testid="items-8-mobile"
                    onClick={() => {
                      onItemsPerPageChange(8);
                      setItemsAnchorEl(null);
                    }}
                  >
                    Show: 8
                  </MenuItem>
                  <MenuItem
                    data-testid="items-16-mobile"
                    onClick={() => {
                      onItemsPerPageChange(16);
                      setItemsAnchorEl(null);
                    }}
                  >
                    Show: 16
                  </MenuItem>
                  <MenuItem
                    data-testid="items-24-mobile"
                    onClick={() => {
                      onItemsPerPageChange(24);
                      setItemsAnchorEl(null);
                    }}
                  >
                    Show: 24
                  </MenuItem>
                  <MenuItem
                    data-testid="items-36-mobile"
                    onClick={() => {
                      onItemsPerPageChange(36);
                      setItemsAnchorEl(null);
                    }}
                  >
                    Show: 36
                  </MenuItem>
                  <MenuItem
                    data-testid="items-all-mobile"
                    onClick={() => {
                      onItemsPerPageChange("all");
                      setItemsAnchorEl(null);
                    }}
                  >
                    Show: All
                  </MenuItem>
                </Menu>
              </>
            )}

            {hasActiveFilters && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Button
                  data-testid="clear-all-button-mobile"
                  variant="contained"
                  onClick={handleClearAll}
                  size="small"
                  fullWidth
                  sx={{ ...buttonStyles }}
                >
                  Clear All
                </Button>
              </>
            )}
          </Box>
        </Collapse>
      </Box>
    );
  }

  // Desktop view
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 1,
        mb: 2,
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      <Button
        data-testid="sort-button"
        variant="outlined"
        onClick={(e) => setSortAnchorEl(e.currentTarget)}
        size="small"
        sx={{
          ...buttonStyles,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {getSortLabel()} ▼
      </Button>
      <Menu
        anchorEl={sortAnchorEl}
        open={Boolean(sortAnchorEl)}
        onClose={() => setSortAnchorEl(null)}
      >
        <MenuItem
          data-testid="sort-trending"
          onClick={() => {
            setSort("trending");
            setSortAnchorEl(null);
          }}
        >
          Trending
        </MenuItem>
        <MenuItem
          data-testid="sort-popular"
          onClick={() => {
            setSort("popular");
            setSortAnchorEl(null);
          }}
        >
          Most Popular
        </MenuItem>
        <MenuItem
          data-testid="sort-newest"
          onClick={() => {
            setSort("newest");
            setSortAnchorEl(null);
          }}
        >
          Newest First
        </MenuItem>
        <MenuItem
          data-testid="sort-oldest"
          onClick={() => {
            setSort("oldest");
            setSortAnchorEl(null);
          }}
        >
          Oldest First
        </MenuItem>
        {isAdmin && (
          <MenuItem
            data-testid="sort-stale"
            onClick={() => {
              setSort("oldest");
              setSelectedStatus("Reviewing");
              setSortAnchorEl(null);
            }}
          >
            Stale
          </MenuItem>
        )}
      </Menu>

      <Button
        data-testid="category-button"
        variant="outlined"
        onClick={(e) => setCatAnchorEl(e.currentTarget)}
        size="small"
        sx={buttonStyles}
      >
        {getCategoryLabel()} ▼
      </Button>
      <Menu anchorEl={catAnchorEl} open={Boolean(catAnchorEl)} onClose={() => setCatAnchorEl(null)}>
        <MenuItem
          data-testid="category-all"
          onClick={() => {
            setSelectedCategory("all");
            setCatAnchorEl(null);
          }}
        >
          All Categories
        </MenuItem>
        {categories &&
          categories.map((cat) => (
            <MenuItem
              key={cat.id || cat.name}
              data-testid={`category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => {
                setSelectedCategory(cat.name);
                setCatAnchorEl(null);
              }}
            >
              {cat.name}
            </MenuItem>
          ))}
      </Menu>

      <Button
        data-testid="status-button"
        variant="outlined"
        onClick={(e) => setStatusAnchorEl(e.currentTarget)}
        size="small"
        sx={buttonStyles}
      >
        {selectedStatus === "all" ? "Status" : selectedStatus} ▼
      </Button>
      <Menu
        anchorEl={statusAnchorEl}
        open={Boolean(statusAnchorEl)}
        onClose={() => setStatusAnchorEl(null)}
      >
        <MenuItem
          data-testid="status-all"
          onClick={() => {
            setSelectedStatus("all");
            setStatusAnchorEl(null);
          }}
        >
          All
        </MenuItem>
        {statuses &&
          statuses.map((status) => (
            <MenuItem
              key={status}
              data-testid={`status-${status.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => {
                setSelectedStatus(status);
                setStatusAnchorEl(null);
              }}
              sx={{
                backgroundColor: getStatusColors(status).bg,
                borderLeft: `4px solid ${getStatusColors(status).border}`,
                color: getStatusColors(status).text,
                fontWeight: 500,
                "&:hover": {
                  backgroundColor: getStatusColors(status).bg,
                  opacity: 0.8,
                },
              }}
            >
              {status}
            </MenuItem>
          ))}
      </Menu>

      <Button
        data-testid="my-ideas-button"
        variant={showMyIdeas ? "contained" : "outlined"}
        onClick={() => setShowMyIdeas(!showMyIdeas)}
        size="small"
        sx={buttonStyles}
      >
        My Ideas
      </Button>

      {onItemsPerPageChange && !isInfiniteScrollActive && (
        <>
          <Button
            data-testid="items-per-page-button"
            variant="outlined"
            onClick={(e) => setItemsAnchorEl(e.currentTarget)}
            size="small"
            sx={buttonStyles}
          >
            Show: {getItemsLabel()} ▼
          </Button>
          <Menu
            anchorEl={itemsAnchorEl}
            open={Boolean(itemsAnchorEl)}
            onClose={() => setItemsAnchorEl(null)}
          >
            <MenuItem
              data-testid="items-8"
              onClick={() => {
                onItemsPerPageChange(8);
                setItemsAnchorEl(null);
              }}
            >
              Show: 8
            </MenuItem>
            <MenuItem
              data-testid="items-16"
              onClick={() => {
                onItemsPerPageChange(16);
                setItemsAnchorEl(null);
              }}
            >
              Show: 16
            </MenuItem>
            <MenuItem
              data-testid="items-24"
              onClick={() => {
                onItemsPerPageChange(24);
                setItemsAnchorEl(null);
              }}
            >
              Show: 24
            </MenuItem>
            <MenuItem
              data-testid="items-36"
              onClick={() => {
                onItemsPerPageChange(36);
                setItemsAnchorEl(null);
              }}
            >
              Show: 36
            </MenuItem>
            <MenuItem
              data-testid="items-all"
              onClick={() => {
                onItemsPerPageChange("all");
                setItemsAnchorEl(null);
              }}
            >
              Show: All
            </MenuItem>
          </Menu>
        </>
      )}

      {hasActiveFilters && (
        <Button
          data-testid="clear-all-button"
          variant="contained"
          onClick={handleClearAll}
          size="small"
          sx={buttonStyles}
        >
          Clear All
        </Button>
      )}
    </Box>
  );
}
