/**
 * Canonical user permission system.
 *
 * Roles provide safe defaults. A user's saved permission matrix overrides those
 * defaults per module/action. `index` means module access: if index is false,
 * the module should not appear in navigation and direct routes should be blocked.
 *
 * _ROLE_PERMISSIONS mirrors backend app/utils/permissions.py _ROLE_PERMISSIONS.
 * Update both files together whenever defaults change.
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

// ── Action flag sets ──────────────────────────────────────────────────────────

type ActionFlags = { index: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean }

const _V: ActionFlags  = { index: true,  view: true,  add: false, edit: false, delete: false }
const _W: ActionFlags  = { index: true,  view: true,  add: true,  edit: true,  delete: false }
const _F: ActionFlags  = { index: true,  view: true,  add: true,  edit: true,  delete: true  }
const _NO: ActionFlags = { index: false, view: false, add: false, edit: false, delete: false }

// ── Per-role default permission table ────────────────────────────────────────
// Mirrors backend app/utils/permissions.py _ROLE_PERMISSIONS exactly.

const _ROLE_PERMISSIONS: Record<string, Partial<Record<Module, ActionFlags>>> = {
  superadmin: Object.fromEntries(MODULES.map((m) => [m.key, _F])) as Record<Module, ActionFlags>,

  admin: {
    dashboard:          _F,
    facilities:         _F,
    users:              _V,
    'service-requests': _F,
    inspections:        _F,
    sales:              _F,
    rentals:            _F,
    inventory:          _F,
    reports:            _F,
    billing:            _F,
    hr:                 _F,
    attendance:         _F,
    'my-timesheets':    _W,
    'my-leave':         _W,
    chat:               _W,
    calendar:           _W,
  },

  hr_manager: {
    dashboard:       _V,
    facilities:      _V,
    users:           _F,
    hr:              _F,
    attendance:      _F,
    'my-timesheets': _W,
    'my-leave':      _W,
    chat:            _W,
    calendar:        _W,
  },

  facility_admin: {
    dashboard:          _V,
    facilities:         _V,
    'service-requests': _W,
    sales:              _W,
    rentals:            _W,
    inventory:          _W,
    billing:            _W,
    attendance:         _W,
    'my-timesheets':    _W,
    'my-leave':         _W,
    chat:               _W,
    calendar:           _W,
  },

  facility_manager: {
    dashboard:          _V,
    facilities:         _V,
    'service-requests': _W,
    sales:              _W,
    rentals:            _W,
    inventory:          _W,
    billing:            _W,
    attendance:         _W,
    'my-timesheets':    _W,
    'my-leave':         _W,
    chat:               _W,
    calendar:           _W,
  },

  technician: {
    dashboard:          _V,
    facilities:         _V,
    'service-requests': _W,
    inspections:        _W,
    inventory:          _W,
    'my-timesheets':    _W,
    'my-leave':         _W,
    chat:               _W,
    calendar:           _W,
  },

  employee: {
    dashboard:          _V,
    facilities:         _V,
    'service-requests': _W,
    'my-timesheets':    _W,
    'my-leave':         _W,
    chat:               _W,
    calendar:           _W,
  },

  client: {
    dashboard:          _V,
    facilities:         _V,
    'service-requests': _W,
    inspections:        _V,
    billing:            _W,
    calendar:           _V,
  },
}

// Derived ROLE_PERMISSIONS: role → list of modules accessible by default
export const ROLE_PERMISSIONS: Record<string, Module[]> = Object.fromEntries(
  Object.entries(_ROLE_PERMISSIONS).map(([role, perms]) => [
    role,
    Object.entries(perms)
      .filter(([, v]) => v?.index)
      .map(([k]) => k as Module),
  ])
)

export const ROLE_SCOPE: Record<string, string> = {
  superadmin:       'all',
  admin:            'all',
  facility_admin:   'facility',
  facility_manager: 'facility',
  technician:       'assigned',
  hr_manager:       'all',
  employee:         'own',
  client:           'facility',
}

const MODULE_ALIASES: Record<string, Module> = {
  service_requests:      'service-requests',
  facility_inventory:    'inventory',
  inventory_parts:       'inventory',
  inventory_tiers:       'inventory',
  inspection_quotations: 'inspections',
  audit_logs:            'dashboard',
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
  const rolePerms = role ? _ROLE_PERMISSIONS[role] : undefined
  const actions = rolePerms?.[module] ?? _NO
  const scope = actions.index ? (ROLE_SCOPE[role || ''] || 'own') : 'none'
  return { ...actions, scope }
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
