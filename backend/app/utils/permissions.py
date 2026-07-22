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

def has_module_permission(user: User, module: str, action: PermissionAction = "index") -> bool:
    """Return True if *user* may perform *action* on *module*.

    Precedence (highest first):
    1. Saved per-user matrix rule in ``user.permissions``
    2. Role default from ``_ROLE_PERMISSIONS``
    """
    module = _canonical_module(module)

    saved = _saved_rule(user, module)
    if saved is not None:
        return bool(saved.get(action))

    role = _role_value(user)
    allowed_actions = _ROLE_PERMISSIONS.get(role, {}).get(module, _NO)
    return action in allowed_actions


def require_module_permission(user: User, module: str, action: PermissionAction = "index") -> None:
    """Raise HTTP 403 if *user* may not perform *action* on *module*."""
    if not has_module_permission(user, module, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permission: {module}.{action}",
        )
