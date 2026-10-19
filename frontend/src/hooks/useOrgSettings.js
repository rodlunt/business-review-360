import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsContext } from "../contexts";
import { api } from "../api";

export function useOrgSettings() {
  const navigate = useNavigate();
  const { setPrimaryColor, setLogoUrl, setLogoHighContrast } = useContext(SettingsContext);
  const [settings, setSettings] = useState({});

  const applySettings = (data) => {
    setSettings(data);
    if (data.primaryColor) setPrimaryColor(data.primaryColor);
    setLogoUrl(data.logoUrl || null);
    setLogoHighContrast(data.logoHighContrast === true || data.logoHighContrast === "true");
  };

  const loadSettings = async () => {
    try {
      const orgId = localStorage.getItem("organizationId");
      if (!orgId) {
        console.log("[App] No organizationId resolved, skipping settings load");
        return;
      }
      const response = await api.get(`/settings/organization/${orgId}/public`, {
        skipOrganizationId: true,
      });
      applySettings(response.data);
    } catch (error) {
      console.error("[App] Failed to load settings:", error);
    }
  };

  const loadOrgSettings = async (organizationId, isPublic = false) => {
    try {
      const endpoint = isPublic
        ? `/settings/organization/${organizationId}/public`
        : `/settings/organization/${organizationId}`;
      const response = await api.get(endpoint, isPublic ? { skipOrganizationId: true } : undefined);
      applySettings(response.data);
    } catch (error) {
      console.error("[App] Failed to load organisation settings:", error);
      if (error.response?.status === 404) {
        navigate("/org", { replace: true });
      }
    }
  };

  return { settings, loadSettings, loadOrgSettings };
}
