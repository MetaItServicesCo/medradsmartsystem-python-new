export interface ServiceRoleUser {
  role?: string | null
  facility_id?: number | null
}

const normalizeRole = (role?: string | null) =>
  String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

const FACILITY_PORTAL_ROLES = new Set([
  'facility_admin',
  'facility_manager',
  'client',
  'employee',
])

/**
 * System administrators are global operators. A legacy `admin` record that is
 * explicitly bound to a facility is a facility portal account, not a global
 * service operator. This preserves migrated production assignments while new
 * facility accounts continue to use the canonical facility roles.
 */
export const isInternalServiceAdmin = (user?: ServiceRoleUser | null) => {
  const role = normalizeRole(user?.role)
  if (role === 'superadmin') return true
  return role === 'admin' && user?.facility_id == null
}

export const isFacilityServiceUser = (user?: ServiceRoleUser | null) => {
  const role = normalizeRole(user?.role)
  return FACILITY_PORTAL_ROLES.has(role)
    || (role === 'admin' && user?.facility_id != null)
}

export const isFacilityServiceBillingUser = (user?: ServiceRoleUser | null) => {
  const role = normalizeRole(user?.role)
  return ['facility_admin', 'facility_manager', 'client'].includes(role)
    || (role === 'admin' && user?.facility_id != null)
}
