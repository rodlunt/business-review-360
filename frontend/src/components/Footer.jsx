import React from "react";
import { Box, Typography, Divider } from "@mui/material";

const rawHash = import.meta.env.VITE_GIT_COMMIT_HASH || "";
const commitHash = rawHash && rawHash !== "unknown" ? rawHash : null;

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        width: "100%",
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        mt: "auto",
        py: 1.5,
        px: { xs: 2, sm: 3 },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "nowrap",
        }}
      >
        {/* Left: wordmark */}
        <Typography
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: "0.875rem",
            letterSpacing: "-0.02em",
            color: "text.primary",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          Business Review{" "}
          <Box component="span" sx={{ color: "#1565c0" }}>
            360
          </Box>
        </Typography>

        {/* Centre: nav links + copyright */}
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            gap: 2,
            flex: 1,
            minWidth: 0,
            justifyContent: "center",
          }}
        >
          {[
            { label: "Contact", href: "https://br360.example.com/contact/" },
            { label: "Privacy", href: "https://br360.example.com/privacy/" },
            { label: "Terms", href: "https://br360.example.com/terms/" },
            { label: "Blog", href: "https://br360.example.com/blog/" },
          ].map(({ label, href }) => (
            <Typography
              key={label}
              component="a"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{
                color: "text.secondary",
                textDecoration: "none",
                fontSize: "0.8rem",
                "&:hover": { color: "primary.main" },
              }}
            >
              {label}
            </Typography>
          ))}

          <Divider orientation="vertical" flexItem sx={{ height: 14, alignSelf: "center" }} />

          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
            &copy; {currentYear} Business Review 360
          </Typography>
        </Box>

        {/* Mobile: copyright only in centre */}
        <Typography
          variant="body2"
          sx={{
            display: { xs: "block", sm: "none" },
            color: "text.secondary",
            fontSize: "0.75rem",
          }}
        >
          &copy; {currentYear}
        </Typography>

        {/* Right: commit ref */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          {commitHash && (
            <Typography
              component="a"
              href={`https://github.com/rodlunt/business-review-360/commit/${commitHash}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                fontSize: "0.65rem",
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                color: "text.secondary",
                textDecoration: "none",
                letterSpacing: "0.03em",
                "&:hover": { color: "text.secondary" },
              }}
            >
              {commitHash}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;
