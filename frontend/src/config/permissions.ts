/**
 * Role-Based Access Control configuration.
 * Maps each role to the modules it can access.
 */

export type Module =
  | 'dashboard'
  | 'facilities'
  | 'users'
  | 'service-requests'
  | 'inspections'
  | 'sales'
  | 'rentals'
  | 'inventory'
  | 'reports'
  | 'attendance'
  | 'billing'
  | 'hr'
  | 'my-timesheets'
  | 'my-leave'
  | 'chat'
  | 'calendar'

export const ROLE_PERMISSIONS: Record<string, Module[]> = {
  superadmin: [
    'dashboard', 'facilities', 'users', 'service-requests', 'inspections',
    'sales', 'rentals', 'inventory', 'reports', 'billing',
    'hr', 'my-timesheets', 'my-leave', 'chat', 'attendance', 'calendar',
  ],
  admin: [
    'dashboard', 'facilities', 'service-requests', 'inspections',
    'sales', 'rentals', 'inventory', 'reports', 'billing',
    'my-timesheets', 'my-leave', 'chat', 'attendance', 'calendar',
  ],
  facility_admin: [
    'dashboard', 'facilities', 'service-requests', 'inventory', 'billing',
    'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  technician: [
    'dashboard', 'service-requests', 'inspections',
    'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  hr_manager: [
    'dashboard', 'users', 'attendance', 'hr', 'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  facility_manager: [
    'dashboard', 'facilities', 'inspections', 'billing',
    'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  employee: [
    'dashboard', 'service-requests', 'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  client: [
    'dashboard', 'service-requests', 'chat', 'calendar',
  ],
}

export function hasPermission(role: string | undefined, module: Module): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  return perms.includes(module)
}

export function getVisibleModules(role: string | undefined): Module[] {
  if (!role) return ['dashboard']
  return ROLE_PERMISSIONS[role] || ['dashboard']
}
