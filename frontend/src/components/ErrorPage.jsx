import React from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import NetworkBackground from "./NetworkBackground";
import Footer from "./Footer";

function HomeButtonInner() {
  const navigate = useNavigate();
  return (
    <Button variant="contained" size="large" onClick={() => navigate("/org")}>
      Go home
    </Button>
  );
}

class NavigateBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Button variant="contained" size="large" component="a" href="/">
          Go home
        </Button>
      );
    }
    return <HomeButtonInner />;
  }
}

function ReportButton() {
  const handleReport = () => {
    window.location.href = "mailto:hello@br360.example.com";
  };
  return (
    <Button variant="outlined" size="large" onClick={handleReport}>
      Report this issue
    </Button>
  );
}

function ErrorPage({ code, title, message, showHomeButton = true, error }) {
  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        backgroundColor: "#f8faff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <NetworkBackground />
      <Container
        maxWidth="sm"
        sx={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            py: 8,
            position: "relative",
          }}
        >
          {code && (
            <Typography
              component="div"
              sx={{
                position: "absolute",
                fontSize: { xs: "8rem", sm: "12rem", md: "16rem" },
                fontWeight: 900,
                color: "text.disabled",
                opacity: 0.12,
                lineHeight: 1,
                userSelect: "none",
                pointerEvents: "none",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                whiteSpace: "nowrap",
              }}
              aria-hidden="true"
            >
              {code}
            </Typography>
          )}

          <Box sx={{ position: "relative", zIndex: 1 }}>
            {code && (
              <Typography
                variant="overline"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "text.secondary",
                  letterSpacing: 2,
                  display: "block",
                  mb: 1,
                }}
              >
                Error {code}
              </Typography>
            )}

            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              {title}
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 420, mx: "auto" }}
            >
              {message}
            </Typography>

            <Box
              sx={{
                display: "flex",
                gap: 2,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {showHomeButton && <NavigateBoundary />}
              <ReportButton />
            </Box>
          </Box>
        </Box>
      </Container>
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Footer />
      </Box>
    </Box>
  );
}

export default ErrorPage;
