import { useParams } from "react-router-dom";
import { getSubdomainOrgId } from "../utils/orgPath";

/**
 * Returns the current tenant's organization ID.
 *
 * Resolution order:
 *   1. Tenant subdomain (e.g. demo-corp.br360.example.com → "demo-corp")
 *   2. :organizationId URL param (legacy /org/:organizationId/... routes)
 *   3. null (no org context; caller must handle)
 */
export default function useOrganizationId() {
  const { organizationId } = useParams();
  return getSubdomainOrgId() || organizationId || null;
}
