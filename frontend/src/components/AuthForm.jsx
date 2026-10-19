import React, { memo } from "react";
import { Box } from "@mui/material";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import { usePageTitle } from "../hooks/usePageTitle";
import useOrganizationId from "../hooks/useOrganizationId";

function AuthForm({ mode = "login", onLogin, onRegister, onSwitchMode }) {
  const organizationId = useOrganizationId();
  // Phase 5 5b (#866): no org in context (bare/main domain: no subdomain,
  // no /org/:id param) means the org-less credentials screen: email key,
  // no per-tenant settings. On a subdomain or /org/:id this is falsy and
  // the org-scoped flow applies -- also email-keyed since #892.
  const orgLess = !organizationId;
  // Issue #626: page-owned document.title. Mode toggles between login/register
  // without a route change, so the title needs to follow the visible form.
  usePageTitle(mode === "register" ? "Sign Up" : "Sign In");

  return (
    <Box>
      <Box sx={{ display: mode === "login" ? "block" : "none" }}>
        <LoginForm onLogin={onLogin} onSwitchMode={onSwitchMode} orgLess={orgLess} />
      </Box>
      <Box sx={{ display: mode === "register" ? "block" : "none" }}>
        <RegisterForm
          onRegister={onRegister}
          onSwitchMode={onSwitchMode}
          orgIdProp={organizationId}
          orgLess={orgLess}
        />
      </Box>
    </Box>
  );
}

export default memo(AuthForm);
