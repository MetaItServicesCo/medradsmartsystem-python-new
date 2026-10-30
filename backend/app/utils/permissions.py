"""Canonical permission system — role defaults + per-user matrix overrides.

The permission table is the single source of truth for what each role can do
by default. Per-user overrides stored in ``user.permissions`` take absolute
precedence over these defaults — that is the entire point of the matrix.

Adding a new module: extend ALL_MODULES and _ROLE_PERMISSIONS.
Changing defaults for a role: edit _ROLE_PERMISSIONS only.
"""

from typing import Any, FrozenSet, Optional

from fastapi import HTTPException, status

from app.models.user import User


PermissionAction = str

# ── Module registry ───────────────────────────────────────────────────────────

# Alternate module keys that some callers use → canonical key
MODULE_ALIASES: dict[str, str] = {
    "service_requests":      "service-requests",
    "test_equipment":        "test-equipment",
    "facility_inventory":    "facility-inventory",
    "equipment":             "facility-inventory",
    "inventory_parts":       "inventory",
    "inventory_tiers":       "inventory",
    "inspection_quotations": "inspections",
    "audit_logs":            "dashboard",
}

ALL_MODULES: list[str] = [
    "dashboard", "facilities", "users", "service-requests", "inspections",
    "sales", "rentals", "facility-inventory", "inventory", "test-equipment", "reports", "billing", "hr",
    "my-timesheets", "my-leave", "chat", "attendance", "calendar",
    # Self-service and company-wide surfaces. Narrow on purpose: they exist
    # so an employee can be given their own record and the staff handbook
    # without being given the HR module, which also holds payroll,
    # terminations and everybody else's contracts.
    "my-attendance", "company-policies",
]

# ── Action sets ───────────────────────────────────────────────────────────────
# Frozen so they are cheap to share across the entire process lifetime.

_V:  FrozenSet[str] = frozenset({"index", "view"})                           # view-only
_W:  FrozenSet[str] = frozenset({"index", "view", "add", "edit"})            # read + write
_F:  FrozenSet[str] = frozenset({"index", "view", "add", "edit", "delete"})  # full control
_NO: FrozenSet[str] = frozenset()                                             # no access

# ── Role permission table ─────────────────────────────────────────────────────
# Maps role → {module → allowed actions}.
# Modules absent from a role's dict are treated as _NO.
# Saved per-user rules in user.permissions override this table completely.

_ROLE_PERMISSIONS: dict[str, dict[str, FrozenSet[str]]] = {
    # ── Full administrators ─────────────────────────────────────────────────
    "superadmin": {m: _F for m in ALL_MODULES},

    "admin": {
        "dashboard":        _F,
        "facilities":       _F,
        "users":            _V,   # admins see users; superadmin/hr_manager manage them
        "service-requests": _F,
        "inspections":      _F,
        "sales":            _F,
        "rentals":          _F,
        "facility-inventory": _F,
        "inventory":        _F,
        "test-equipment":   _F,
        "reports":          _F,
        "billing":          _F,
        "hr":               _F,   # admin co-manages HR alongside hr_manager
        "attendance":       _F,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    # ── HR manager ─────────────────────────────────────────────────────────
    "hr_manager": {
        "dashboard":        _V,
        "facilities":       _V,   # needed for facility-dropdown in employee forms
        "users":            _F,   # manages user accounts (mirrors get_superadmin_or_hr)
        "hr":               _F,
        "attendance":       _F,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    # ── Facility roles ──────────────────────────────────────────────────────
    "facility_admin": {
        "dashboard":        _V,
        "facilities":       _V,   # view only; only admin can create/delete facilities
        "service-requests": _W,
        "sales":            _W,
        "rentals":          _W,
        "facility-inventory": _W,
        "inventory":        _W,
        "test-equipment":   _W,
        "billing":          _W,
        "attendance":       _W,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    "facility_manager": {
        "dashboard":        _V,
        "facilities":       _V,
        "service-requests": _W,
        "sales":            _W,
        "rentals":          _W,
        "facility-inventory": _W,
        "inventory":        _W,
        "test-equipment":   _W,
        "billing":          _W,
        "attendance":       _W,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    # ── Operational roles ───────────────────────────────────────────────────
    "technician": {
        "dashboard":        _V,
        "facilities":       _V,   # needed for inspection / service-request routing
        "service-requests": _W,
        "inspections":      _W,
        "facility-inventory": _V,
        "inventory":        _W,
        "test-equipment":   _V,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    "employee": {
        "dashboard":        _V,
        "facilities":       _V,
        "service-requests": _W,   # can raise and track own requests
        "facility-inventory": _V,
        "my-timesheets":    _W,
        "my-leave":         _W,
        "chat":             _W,
        "calendar":         _W,
        "my-attendance":    _V,   # their own record, never anyone else's
        "company-policies": _V,   # the handbook and notices; publishing stays in hr
    },

    "client": {
        "dashboard":        _V,
        "facilities":       _V,   # sees their own facility
        "service-requests": _W,
        "inspections":      _V,
        "facility-inventory": _V,
        "billing":          _W,
        "calendar":         _V,   # appointment visibility
    },
}

# Derived ROLE_MODULES for callers that only need module membership
ROLE_MODULES: dict[str, set[str]] = {
    role: {m for m, actions in perms.items() if actions}
    for role, perms in _ROLE_PERMISSIONS.items()
}

# Canonical scope per role (used by the frontend matrix editor)
ROLE_SCOPE: dict[str, str] = {
    "superadmin":      "all",
    "admin":           "all",
    "hr_manager":      "all",
    "facility_admin":  "facility",
    "facility_manager": "facility",
    "technician":      "assigned",
    "employee":        "own",
    "client":          "facility",
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _role_value(user: User) -> str:
    role = getattr(user, "role", "")
    return getattr(role, "value", role) or ""


def _canonical_module(module: str) -> str:
    return MODULE_ALIASES.get(module, module)


def _saved_rule(user: User, module: str) -> Optional[dict[str, Any]]:
    """Return the saved per-user rule dict for *module*, or None."""
    permissions = user.permissions or {}
    if not isinstance(permissions, dict):
        return None
    direct = permissions.get(module)
    if isinstance(direct, dict):
        return direct
    # Tolerate callers that saved under an alias key
    for raw_key, raw_rule in permissions.items():
        if _canonical_module(str(raw_key)) == module and isinstance(raw_rule, dict):
            return raw_rule
    return None


# ── Public API ────────────────────────────────────────────────────────────────

# ── Also working as a technician ──────────────────────────────────────────────
# A user keeps their role and every right it gives, and may additionally be
# flagged to work as a technician on jobs assigned to them. The flag only ever
# adds: these helpers are the single definition of what it adds, so the many
# places that used to ask "is this a technician?" cannot drift apart.

def acts_as_technician(user: User) -> bool:
    """A technician by role, or a user flagged to work as one."""
    return _role_value(user) == "technician" or is_additional_technician(user)


def is_additional_technician(user: User) -> bool:
    """Flagged to work as a technician on top of a different role.

    Never true for a client: clients are customers' own accounts, not staff,
    so the flag is refused for them and ignored here even if it were set.
    """
    role = _role_value(user)
    return bool(getattr(user, "is_technician", False)) and role not in ("technician", "client")


def role_grants(user: User, module: str, action: PermissionAction = "view") -> bool:
    """What the user's own role (or saved matrix) allows, ignoring the flag."""
    module = _canonical_module(module)
    saved = _saved_rule(user, module)
    if saved is not None:
        return bool(saved.get(action))
    return action in _ROLE_PERMISSIONS.get(_role_value(user), {}).get(module, _NO)


def assigned_only(user: User, module: str) -> bool:
    """Should this user see only the work in *module* that is assigned to them?

    True for a technician. True for a flagged user whose own role has no access
    to the module -- an HR manager who also does technician work sees the jobs
    assigned to them, never every service request in the system.
    """
    if _role_value(user) == "technician":
        return True
    return is_additional_technician(user) and not role_grants(user, module, "view")


def also_assigned(user: User, module: str) -> bool:
    """Does this user see their usual view of *module* plus their assigned work?"""
    return is_additional_technician(user) and role_grants(user, module, "view")


def has_module_permission(user: User, module: str, action: PermissionAction = "index") -> bool:
    """Return True if *user* may perform *action* on *module*.

    Precedence (highest first):
    1. Saved per-user matrix rule in ``user.permissions``
    2. Role default from ``_ROLE_PERMISSIONS``
    3. For a user also working as a technician, the technician's default,
       added on top -- only where neither of the above already decided.
    """
    module = _canonical_module(module)

    saved = _saved_rule(user, module)
    if saved is not None:
        return bool(saved.get(action))

    role = _role_value(user)
    allowed_actions = _ROLE_PERMISSIONS.get(role, {}).get(module, _NO)
    if action in allowed_actions:
        return True
    if is_additional_technician(user):
        return action in _ROLE_PERMISSIONS.get("technician", {}).get(module, _NO)
    return False


def require_module_permission(user: User, module: str, action: PermissionAction = "index") -> None:
    """Raise HTTP 403 if *user* may not perform *action* on *module*."""
    if not has_module_permission(user, module, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permission: {module}.{action}",
        )
