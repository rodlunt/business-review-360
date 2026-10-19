// Status color mappings for consistent styling across the app
export const getStatusColors = (status) => {
  switch (status?.toLowerCase()) {
    case "in progress":
    case "approved":
    case "complete":
      return {
        bg: "#e8f5e9", // Light green
        border: "#66bb6a", // Green
        text: "#000000", // Black text
        dot: "#2e7d32", // Dark green dot
      };
    case "reviewing":
      return {
        bg: "#fff9c4", // Light yellow
        border: "#ffd54f", // Yellow
        text: "#000000", // Black text
        dot: "#f57f17", // Dark orange/yellow dot
      };
    case "rejected":
    case "duplicate":
    case "hidden":
      return {
        bg: "#ffebee", // Light red
        border: "#ef5350", // Red
        text: "#000000", // Black text
        dot: "#c62828", // Dark red dot
      };
    case "open":
    default:
      return {
        bg: "#f5f5f5", // Light gray
        border: "#bdbdbd", // Gray
        text: "#000000", // Black text
        dot: "#9e9e9e", // Medium gray dot
      };
  }
};
