import { useState, useEffect, createContext, useContext } from "react";
import { api, setAuthToken } from "./api";
import { getSubdomainURL, isOnSubdomain } from "./utils/orgPath";
import { resolveLoginResponse } from "./utils/resolveLoginResponse";

// Create AuthContext
const AuthContext = createContext();

// AuthProvider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);
  // Phase 3 Slice 4 (#851): the org-picker modal pre-selects the user's
  // primary org. /auth/memberships returns it alongside the list.
  const [primaryOrganizationId, setPrimaryOrganizationId] = useState(null);

  const fetchMemberships = async () => {
    try {
      const res = await api.get("/auth/memberships");
      setMemberships(res.data.memberships || []);
      setPrimaryOrganizationId(res.data.primaryOrganizationId ?? null);
    } catch {
      // non-fatal: user just won't see the org switcher
    }
  };

  // Set auth token on component mount if it exists in localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    // If we have a token, always validate it with the backend
    // Don't immediately clear based on stale localStorage - let the API call determine validity
    if (storedToken) {
      setAuthToken(storedToken);

      // Check if stored user data looks valid (has organizationId)
      // If valid, set it immediately for faster UI, but still fetch fresh data
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.organizationId) {
            console.log("[Auth] Using cached user data while fetching fresh data");
            setUser(userData);
          } else {
            console.warn("[Auth] Stored user missing organizationId, will fetch from API");
          }
        } catch (e) {
          console.error("[Auth] Failed to parse stored user:", e);
          localStorage.removeItem("user");
        }
      }

      // Always fetch current user data from backend to ensure it's fresh and valid
      fetchMemberships();
      api
        .get("/auth/me")
        .then((res) => {
          console.log("[Auth] Fetched user from /auth/me:", res.data);

          // Validate that user has organizationId
          if (!res.data.organizationId) {
            console.error("[Auth] User from /auth/me is missing organizationId, logging out");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("organizationId");
            setToken(null);
            setAuthToken(null);
            setUser(null);
            setLoading(false);
            return;
          }

          // Only update user if data has actually changed (prevent unnecessary re-renders)
          const hasChanged = !user || JSON.stringify(user) !== JSON.stringify(res.data);
          if (hasChanged) {
            setUser(res.data);
            // Persist user data and organizationId to localStorage
            localStorage.setItem("user", JSON.stringify(res.data));
            localStorage.setItem("organizationId", res.data.organizationId);
          }
        })
        .catch((err) => {
          console.error("[Auth] Error fetching user data:", err);
          // If token is invalid, clear it
          if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            console.warn("[Auth] Token is invalid (401/403), clearing auth data");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("organizationId");
            setToken(null);
            setAuthToken(null);
            setUser(null);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // No token means definitely not logged in
      setLoading(false);
    }
  }, []);

  // Phase 5 (5b, #866); org-scoped username dropped in #892. `credential`
  // is the email on BOTH the org-scoped path (organizationId present) and
  // the bare/main-domain org-less path (organizationId absent), mirroring
  // the backend validator which now requires email unconditionally.
  // Returns the classified result:
  //   { kind: "authed", user }: session set here (org-scoped, OR
  //                             org-less resolving to a single org).
  //   { kind: "pick", pickToken, memberships, primaryOrganizationId }:
  //                             multi-org org-less, NO session set; the
  //                             caller renders the picker and exchanges
  //                             the pickToken via loginWithPickToken.
  const login = async (credential, password, organizationId, recaptchaToken) => {
    // Clear localStorage on login to prevent data leakage between organisations (#402)
    localStorage.clear();

    // #892: email is the sole credential on both paths now. organizationId
    // is included only when present (org-scoped); its absence is what
    // routes the backend to the org-optional branch.
    const payload = organizationId
      ? { email: credential, password, organizationId }
      : { email: credential, password };
    if (recaptchaToken) payload.recaptchaToken = recaptchaToken;

    const res = await api.post("/auth/login", payload);
    const resolved = resolveLoginResponse(res.data);

    if (resolved.kind === "pick") {
      // Multi-org org-less login: deliberately NO session set here.
      return resolved;
    }
    if (resolved.kind !== "authed") {
      // Half-formed / unrecognised body: fail closed rather than set a
      // broken session. LoginForm surfaces err.message to the user.
      throw new Error("Login failed. Please try again.");
    }

    const { user: userData } = resolved;
    setToken(res.data.token);
    setUser(userData);
    setAuthToken(res.data.token);
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(userData));
    if (userData.organizationId) {
      localStorage.setItem("organizationId", userData.organizationId);
    }
    fetchMemberships();
    return resolved;
  };

  // #892: username dropped as a registration credential -- email is the
  // sole credential on BOTH the org-scoped and org-less paths, mirroring
  // `login` above. The backend auto-generates a display-name username
  // server-side; the frontend never types or sees one at registration.
  const register = async (email, password, organizationId, referralCode, recaptchaToken) => {
    console.log("[auth.js register] Sending registration request with:", {
      email: email ? `${email.substring(0, 3)}***` : "none",
      organizationId: organizationId || "NOT PROVIDED",
    });

    const res = await api.post("/auth/register", {
      email,
      password,
      organizationId,
      // Phase 3 Slice 1: optional consultant referral code, captured at
      // signup and stored on the user (backend trims/soft-validates).
      ...(referralCode && referralCode.trim() && { referralCode: referralCode.trim() }),
      ...(recaptchaToken && { recaptchaToken }),
    });

    console.log("[auth.js register] Registration response user:", {
      id: res.data.user.id,
      username: res.data.user.username,
      organizationId: res.data.user.organizationId || "NO ORG ID IN RESPONSE!",
    });
    setToken(res.data.token);
    setUser(res.data.user);
    setAuthToken(res.data.token);
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    if (res.data.user.organizationId) {
      localStorage.setItem("organizationId", res.data.user.organizationId);
    }
    fetchMemberships();
    return res.data.user;
  };

  // Store a pre-issued token (from OAuth callback) without posting credentials.
  const loginWithToken = async (token) => {
    localStorage.clear();
    setAuthToken(token);
    const res = await api.get("/auth/me");
    if (!res.data.organizationId) throw new Error("OAuth user missing organisationId");
    setToken(token);
    setUser(res.data);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(res.data));
    localStorage.setItem("organizationId", res.data.organizationId);
    fetchMemberships();
    return res.data;
  };

  // #804: exchange a pick token + org choice for a full JWT (org switch flow).
  const loginWithPickToken = async (pickToken, organizationId) => {
    localStorage.clear();
    const res = await api.post("/auth/select-org", { pickToken, organizationId });
    const { token: newToken, user: userData } = res.data;
    setToken(newToken);
    setUser(userData);
    setAuthToken(newToken);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(userData));
    if (userData.organizationId) {
      localStorage.setItem("organizationId", userData.organizationId);
    }
    fetchMemberships();
    return userData;
  };

  // Phase 3 Slice 4 (#851): in-place org switch for the org-picker modal.
  // Unlike switchToOrg (which hard-redirects to the target org's login),
  // this exchanges a pick token and sets the new session in context with no
  // navigation, so the modal can sequence into the welcome/tour flow.
  // select-org persists the choice as the new primary (last-wins, Slice 2a).
  const pickOrg = async (targetOrgId) => {
    const res = await api.post("/auth/org-switch/token");
    const { pickToken } = res.data;
    return loginWithPickToken(pickToken, targetOrgId);
  };

  // #804: issue a pick token then navigate to the target org's login page
  // so the user is auto-signed in there without re-entering credentials.
  const switchToOrg = async (targetOrgId) => {
    const res = await api.post("/auth/org-switch/token");
    const { pickToken } = res.data;
    const params = new URLSearchParams({ pickToken });
    if (isOnSubdomain()) {
      window.location.href = `${getSubdomainURL(targetOrgId, "login")}?${params}`;
    } else {
      window.location.href = `/org/${targetOrgId}/login?${params}`;
    }
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch (_) {
      // best-effort: revoke server-side session if reachable, clear client regardless
    }
    setUser(null);
    setToken(null);
    setAuthToken(null);
    setMemberships([]);
    setPrimaryOrganizationId(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("organizationId");
  };

  const value = {
    user,
    setUser,
    token,
    loading,
    memberships,
    primaryOrganizationId,
    login,
    loginWithToken,
    loginWithPickToken,
    pickOrg,
    register,
    logout,
    switchToOrg,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Updated useAuth hook to use context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
