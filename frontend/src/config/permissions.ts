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
  | 'equipment'
  | 'inventory'
  | 'reports'
  | 'chat'
  | 'calendar'

export const ROLE_PERMISSIONS: Record<string, Module[]> = {
  superadmin: [
    'dashboard', 'facilities', 'users', 'service-requests', 'inspections',
    'sales', 'rentals', 'equipment', 'inventory', 'reports', 'chat',
    'calendar',
  ],
  admin: [
    'dashboard', 'facilities', 'service-requests', 'inspections',
    'sales', 'rentals', 'equipment', 'inventory', 'reports', 'chat',
    'calendar',
  ],
  facility_admin: [
    'dashboard', 'facilities', 'service-requests', 'equipment', 'inventory', 'chat',
    'calendar',
  ],
  technician: [
    'dashboard', 'service-requests', 'inspections', 'equipment', 'chat',
    'calendar',
  ],
  hr_manager: [
    'dashboard', 'reports', 'chat',
    'calendar',
  ],
  facility_manager: [
    'dashboard', 'facilities', 'equipment', 'inspections', 'chat',
    'calendar',
  ],
  employee: [
    'dashboard', 'service-requests', 'chat',
    'calendar',
  ],
  client: [
    'dashboard', 'service-requests', 'chat',
    'calendar',
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
