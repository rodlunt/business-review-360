import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import PeopleIcon from "@mui/icons-material/People";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import LogoutIcon from "@mui/icons-material/Logout";

const AdminConsultants = lazy(() => import("./admin/AdminConsultants"));
const AdminCommission = lazy(() => import("./admin/AdminCommission"));
const AdminOps = lazy(() => import("./admin/AdminOps"));

const DRAWER_WIDTH = 220;

const ERROR_MESSAGES = {
  provider_not_configured: "OAuth provider is not configured.",
  token_exchange_failed: "Could not complete sign-in with GitHub. Please try again.",
  invalid_profile: "Could not retrieve your GitHub profile.",
  not_authorised: "Your GitHub account is not authorised for this console.",
  invalid_state: "Sign-in session expired. Please try again.",
  server_error: "An unexpected error occurred. Please try again.",
};

// ---------------------------------------------------------------------------
// Admin OAuth callback: stores token, redirects home
// ---------------------------------------------------------------------------
function AdminOAuthCallback({ onLogin }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  useEffect(() => {
    if (error) {
      const msg = ERROR_MESSAGES[error] || "Sign-in failed.";
      navigate(`/?loginError=${encodeURIComponent(msg)}`, { replace: true });
      return;
    }
    if (!token) {
      navigate("/?loginError=No%20token%20received.", { replace: true });
      return;
    }
    localStorage.setItem("token", token);
    onLogin().then(() => navigate("/", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}
    >
      <CircularProgress />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------
function AdminLogin() {
  const [searchParams] = useSearchParams();
  const loginError = searchParams.get("loginError");

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 3,
        backgroundColor: "grey.50",
      }}
    >
      <Box sx={{ textAlign: "center", mb: 1 }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          BR360 Admin
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Internal console
        </Typography>
      </Box>

      {loginError && (
        <Alert severity="error" sx={{ width: 360 }}>
          {loginError}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        startIcon={<GitHubIcon />}
        href="/api/auth/oauth/github?adminRedirect=1"
        sx={{ width: 280, py: 1.5, textTransform: "none", fontSize: "1rem" }}
      >
        Sign in with GitHub
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Admin layout with sidebar
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { label: "Consultants", path: "/", icon: <PeopleIcon /> },
  { label: "Commission", path: "/commission", icon: <AttachMoneyIcon /> },
  { label: "Ops", path: "/ops", icon: <MonitorHeartIcon /> },
];

function AdminLayout({ user, onLogout }) {
  const location = useLocation();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
            BR360 Admin
          </Typography>
          <Typography variant="body2" sx={{ mr: 2, opacity: 0.8 }}>
            {user.username}
          </Typography>
          <Button
            color="inherit"
            size="small"
            startIcon={<LogoutIcon />}
            onClick={onLogout}
            sx={{ textTransform: "none" }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto", mt: 1 }}>
          <List disablePadding>
            {NAV_ITEMS.map((item) => {
              const active =
                item.path === "/"
                  ? location.pathname === "/" || location.pathname === ""
                  : location.pathname.startsWith(item.path);
              return (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    component={NavLink}
                    to={item.path}
                    selected={active}
                    sx={{
                      "&.active": { backgroundColor: "primary.lighter" },
                      "&.Mui-selected": { backgroundColor: "action.selected" },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: active ? "primary.main" : "inherit" }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: "0.9375rem",
                        fontWeight: active ? 600 : 400,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
          <Divider sx={{ mt: 1 }} />
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 4, mt: 8 }}>
        <Suspense fallback={<CircularProgress size={32} />}>
          <Routes>
            <Route index element={<AdminConsultants />} />
            <Route path="commission" element={<AdminCommission />} />
            <Route path="ops" element={<AdminOps />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// AdminApp: auth shell
// ---------------------------------------------------------------------------
export default function AdminApp() {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAdminUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/internal/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAdminUser(await res.json());
      } else {
        localStorage.removeItem("token");
        setAdminUser(null);
      }
    } catch {
      setAdminUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAdminUser(null);
  };

  if (loading) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/oauth-callback" element={<AdminOAuthCallback onLogin={verifyToken} />} />
      {adminUser ? (
        <Route path="*" element={<AdminLayout user={adminUser} onLogout={handleLogout} />} />
      ) : (
        <Route path="*" element={<AdminLogin />} />
      )}
    </Routes>
  );
}
