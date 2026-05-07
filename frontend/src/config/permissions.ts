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

export const ROLE_PERMISSIONS: Record<string, Module[]> = {
  superadmin: [
    'dashboard', 'facilities', 'users', 'service-requests', 'inspections',
    'sales', 'rentals', 'equipment', 'inventory', 'reports', 'chat',
  ],
  admin: [
    'dashboard', 'facilities', 'service-requests', 'inspections',
    'sales', 'rentals', 'equipment', 'inventory', 'reports', 'chat',
  ],
  facility_admin: [
    'dashboard', 'facilities', 'service-requests', 'equipment', 'inventory', 'chat',
  ],
  technician: [
    'dashboard', 'service-requests', 'inspections', 'equipment', 'chat',
  ],
  hr_manager: [
    'dashboard', 'reports', 'chat',
  ],
  facility_manager: [
    'dashboard', 'facilities', 'equipment', 'inspections', 'chat',
  ],
  employee: [
    'dashboard', 'service-requests', 'chat',
  ],
  client: [
    'dashboard', 'service-requests', 'chat',
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
