/**
 * Customers' accounts - a facility's admin or manager, or a client. They do
 * not mark attendance and cannot be tracked. Everyone else, employees
 * included, is staff.
 *
 * Mirrors the backend's is_facility_scoped_user, which decides the same thing
 * for the attendance and tracking endpoints. Not the same as
 * isFacilityServiceUser, which is about who sees the customer's side of a
 * service request and deliberately counts employees in.
 */
const CUSTOMER_ROLES = new Set(['facility_admin', 'facility_manager', 'client'])

export const isCustomerAccount = (user?: { role?: string | null } | null) =>
  CUSTOMER_ROLES.has(String(user?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
