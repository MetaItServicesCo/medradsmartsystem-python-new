/**
 * Canonical user permission system.
 *
 * Roles provide safe defaults. A user's saved permission matrix overrides those
 * defaults per module/action. `index` means module access: if index is false,
 * the module should not appear in navigation and direct routes should be blocked.
 */

export type PermissionAction = 'index' | 'view' | 'add' | 'edit' | 'delete'

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

export interface PermissionRule {
  index: boolean
  view: boolean
  add: boolean
  edit: boolean
  delete: boolean
  scope: string
}

export type PermissionMatrix = Record<string, PermissionRule>

export interface PermissionUser {
  role?: string
  permissions?: PermissionMatrix
}

export const ACTIONS: PermissionAction[] = ['index', 'view', 'add', 'edit', 'delete']

export const MODULES: Array<{ key: Module; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'users', label: 'Users' },
  { key: 'service-requests', label: 'Service Requests' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'sales', label: 'Sales' },
  { key: 'rentals', label: 'Rentals' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'reports', label: 'Reports' },
  { key: 'billing', label: 'Billing' },
  { key: 'hr', label: 'HR' },
  { key: 'attendance', label: 'Smart Attendance' },
  { key: 'my-timesheets', label: 'My Timesheets' },
  { key: 'my-leave', label: 'My Leave' },
  { key: 'chat', label: 'Chat' },
  { key: 'calendar', label: 'Calendar' },
]

const fullAccess: Module[] = [
  'dashboard', 'facilities', 'users', 'service-requests', 'inspections',
  'sales', 'rentals', 'inventory', 'reports', 'billing',
  'hr', 'my-timesheets', 'my-leave', 'chat', 'attendance', 'calendar',
]

export const ROLE_PERMISSIONS: Record<string, Module[]> = {
  superadmin: fullAccess,
  admin: [
    'dashboard', 'facilities', 'service-requests', 'inspections',
    'sales', 'rentals', 'inventory', 'reports', 'billing',
    'my-timesheets', 'my-leave', 'chat', 'attendance', 'calendar',
  ],
  facility_admin: [
    'dashboard', 'facilities', 'service-requests', 'inventory', 'billing', 'chat', 'calendar',
  ],
  facility_manager: [
    'dashboard', 'facilities', 'service-requests', 'inventory', 'billing', 'chat', 'calendar',
  ],
  technician: [
    'dashboard', 'service-requests', 'inspections', 'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  hr_manager: [
    'dashboard', 'users', 'attendance', 'hr', 'my-timesheets', 'my-leave', 'chat', 'calendar',
  ],
  employee: [
    'dashboard', 'my-timesheets', 'my-leave',
  ],
  client: [
    'dashboard', 'billing', 'service-requests', 'inspections',
  ],
}

export const ROLE_SCOPE: Record<string, string> = {
  superadmin: 'all',
  admin: 'all',
  facility_admin: 'facility',
  facility_manager: 'facility',
  technician: 'assigned',
  hr_manager: 'all',
  employee: 'own',
  client: 'facility',
}

const MODULE_ALIASES: Record<string, Module> = {
  service_requests: 'service-requests',
  facility_inventory: 'inventory',
  inventory_parts: 'inventory',
  inventory_tiers: 'inventory',
  inspection_quotations: 'inspections',
  audit_logs: 'dashboard',
}

const canonicalModule = (module: string): Module | null => {
  if (MODULES.some((item) => item.key === module)) return module as Module
  return MODULE_ALIASES[module] ?? null
}

export const emptyRule = (scope = 'none'): PermissionRule => ({
  index: false,
  view: false,
  add: false,
  edit: false,
  delete: false,
  scope,
})

export const defaultRuleFor = (role: string | undefined, module: Module): PermissionRule => {
  const allowed = Boolean(role && ROLE_PERMISSIONS[role]?.includes(module))
  const scope = allowed ? ROLE_SCOPE[role || ''] || 'own' : 'none'
  const full = role === 'superadmin' || role === 'admin'
  const canWrite = full || ['facility_admin', 'facility_manager'].includes(role || '')
  const technicianWrite = role === 'technician' && ['service-requests', 'inspections', 'chat'].includes(module)
  const ownWrite = role === 'employee' && ['my-timesheets', 'my-leave'].includes(module)
  const clientWrite = role === 'client' && ['billing', 'service-requests'].includes(module)

  return {
    index: allowed,
    view: allowed,
    add: allowed && (canWrite || technicianWrite || ownWrite || clientWrite),
    edit: allowed && (canWrite || technicianWrite || ownWrite || clientWrite),
    delete: full,
    scope,
  }
}

export const buildDefaultPermissionMatrix = (role: string | undefined): PermissionMatrix =>
  MODULES.reduce<PermissionMatrix>((acc, module) => {
    acc[module.key] = defaultRuleFor(role, module.key)
    return acc
  }, {})

export const normalizePermissionMatrix = (matrix?: PermissionMatrix): PermissionMatrix => {
  const normalized: PermissionMatrix = {}
  Object.entries(matrix || {}).forEach(([rawKey, rule]) => {
    const module = canonicalModule(rawKey)
    if (!module) return
    const current = normalized[module] || emptyRule(rule.scope || 'own')
    normalized[module] = {
      index: Boolean(current.index || rule.index),
      view: Boolean(current.view || rule.view),
      add: Boolean(current.add || rule.add),
      edit: Boolean(current.edit || rule.edit),
      delete: Boolean(current.delete || rule.delete),
      scope: rule.scope || current.scope || 'own',
    }
  })
  return normalized
}

const hasCustomRule = (user: PermissionUser | null | undefined, module: Module) => {
  const normalized = normalizePermissionMatrix(user?.permissions)
  return Boolean(normalized[module])
}

export function getPermissionRule(
  user: PermissionUser | null | undefined,
  module: Module | string,
): PermissionRule {
  const canonical = canonicalModule(module)
  if (!canonical) return emptyRule()
  const saved = normalizePermissionMatrix(user?.permissions)[canonical]
  if (saved) return saved
  return defaultRuleFor(user?.role, canonical)
}

export function hasPermission(
  userOrRole: PermissionUser | string | null | undefined,
  module: Module | string,
  action: PermissionAction = 'index',
): boolean {
  const user = typeof userOrRole === 'string' ? { role: userOrRole } : userOrRole
  const rule = getPermissionRule(user, module)
  return Boolean(rule[action])
}

export function canAccessModule(user: PermissionUser | null | undefined, module: Module | string): boolean {
  return hasPermission(user, module, 'index')
}

export function getVisibleModules(userOrRole: PermissionUser | string | null | undefined): Module[] {
  const user = typeof userOrRole === 'string' ? { role: userOrRole } : userOrRole
  return MODULES
    .map((module) => module.key)
    .filter((module) => {
      if (hasCustomRule(user, module)) return canAccessModule(user, module)
      return Boolean(user?.role && ROLE_PERMISSIONS[user.role]?.includes(module))
    })
}

export function enabledPermissionCount(user: PermissionUser | null | undefined): number {
  const matrix = normalizePermissionMatrix(user?.permissions)
  if (!Object.keys(matrix).length) return getVisibleModules(user).reduce((sum, module) => {
    const rule = defaultRuleFor(user?.role, module)
    return sum + ACTIONS.filter((action) => rule[action]).length
  }, 0)
  return Object.values(matrix).reduce((sum, rule) => (
    sum + ACTIONS.filter((action) => rule[action]).length
  ), 0)
}
