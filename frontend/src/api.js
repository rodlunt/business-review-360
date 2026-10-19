import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

console.log("[API] VITE_API_URL from env:", import.meta.env.VITE_API_URL);
console.log("[API] API_URL being used:", API_URL);

export const api = axios.create({
  baseURL: API_URL,
});

// Export the base URL (without /api suffix) for constructing upload URLs
export const API_BASE_URL = API_URL.replace(/\/api\/?$/, "");
console.log("[API] API_BASE_URL for uploads:", API_BASE_URL);

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// Detect gateway/service-unavailable errors and fire a custom DOM event.
// Listener not wired here (future work). Search 'br360:service-unavailable' to find it.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 502 || status === 503) {
      window.dispatchEvent(new CustomEvent("br360:service-unavailable", { detail: { status } }));
    }
    return Promise.reject(error);
  }
);

// Ensure a stable per-browser client id to avoid Docker bridge IP grouping
const CLIENT_ID_KEY = "clientId";
try {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cid-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  // Add clientId and organizationId to all requests
  api.interceptors.request.use((config) => {
    try {
      const skipOrganizationId = config.skipOrganizationId === true;
      delete config.skipOrganizationId;

      const id = localStorage.getItem(CLIENT_ID_KEY) || clientId;
      if (!config.params) config.params = {};
      // Preserve existing params while adding clientId
      config.params.clientId = id;

      // Add organizationId from localStorage if available
      // This is required for tenant resolution on the backend
      const organizationId = localStorage.getItem("organizationId");
      if (!skipOrganizationId && organizationId && !config.params.organizationId) {
        config.params.organizationId = organizationId;
      }

      // For POST/PUT/PATCH requests, also add to body if not already present
      if (config.data && typeof config.data === "object" && !Array.isArray(config.data)) {
        if (!skipOrganizationId && organizationId && !config.data.organizationId) {
          config.data.organizationId = organizationId;
        }
      }
    } catch (e) {
      // ignore
    }
    return config;
  });
} catch (e) {
  // localStorage may not be available in some environments (SSR/test)
}
