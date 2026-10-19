import React from "react";
import { Box, Button, Typography } from "@mui/material";

export default function Pagination({ page, totalPages, onPageChange, totalItems, itemsPerPage }) {
  // Calculate display range for current page
  const startItem = totalItems > 0 ? (page - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(page * itemsPerPage, totalItems);

  // Generate smart pagination array (show first, last, current, and surrounding pages)
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7; // Maximum number of page buttons to show

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      let startPage, endPage;

      if (page <= 3) {
        // Near the beginning
        startPage = 2;
        endPage = 5;
      } else if (page >= totalPages - 2) {
        // Near the end
        startPage = totalPages - 4;
        endPage = totalPages - 1;
      } else {
        // In the middle
        startPage = page - 1;
        endPage = page + 1;
      }

      // Add ellipsis after first page if needed
      if (startPage > 2) {
        pages.push("...");
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        pages.push("...");
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mt: 2,
        gap: 1,
      }}
    >
      {/* Only show navigation buttons if there are multiple pages */}
      {totalPages > 1 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 1.5,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            variant="outlined"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            sx={{ height: 32 }}
          >
            PREV
          </Button>
          {pageNumbers.map((pageNum, idx) =>
            pageNum === "..." ? (
              <Typography
                key={`ellipsis-${idx}`}
                sx={{
                  px: 1,
                  color: "text.secondary",
                  userSelect: "none",
                }}
              >
                ...
              </Typography>
            ) : (
              <Button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                variant={page === pageNum ? "contained" : "outlined"}
                sx={{ height: 32, minWidth: 40 }}
              >
                {pageNum}
              </Button>
            )
          )}
          <Button
            variant="outlined"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            sx={{ height: 32 }}
          >
            NEXT
          </Button>
        </Box>
      )}
      {/* Always show item count when totalItems is provided */}
      {totalItems !== undefined && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontSize: "0.75rem",
            userSelect: "none",
          }}
        >
          Showing {startItem}-{endItem} of {totalItems} items
        </Typography>
      )}
    </Box>
  );
}
