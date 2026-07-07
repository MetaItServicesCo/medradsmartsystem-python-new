from typing import Any, Optional

from fastapi import HTTPException, status

from app.models.user import User


PermissionAction = str

MODULE_ALIASES = {
    "service_requests": "service-requests",
    "facility_inventory": "inventory",
    "inventory_parts": "inventory",
    "inventory_tiers": "inventory",
    "inspection_quotations": "inspections",
    "audit_logs": "dashboard",
}

ROLE_MODULES = {
    "superadmin": {
        "dashboard", "facilities", "users", "service-requests", "inspections",
        "sales", "rentals", "inventory", "reports", "billing", "hr",
        "my-timesheets", "my-leave", "chat", "attendance", "calendar",
    },
    "admin": {
        "dashboard", "facilities", "service-requests", "inspections",
        "sales", "rentals", "inventory", "reports", "billing",
        "my-timesheets", "my-leave", "chat", "attendance", "calendar",
    },
    "facility_admin": {"dashboard", "facilities", "service-requests", "inventory", "billing", "chat", "calendar"},
    "facility_manager": {"dashboard", "facilities", "service-requests", "inventory", "billing", "chat", "calendar"},
    "technician": {"dashboard", "service-requests", "inspections", "my-timesheets", "my-leave", "chat", "calendar"},
    "hr_manager": {"dashboard", "users", "attendance", "hr", "my-timesheets", "my-leave", "chat", "calendar"},
    "employee": {"dashboard", "my-timesheets", "my-leave"},
    "client": {"dashboard", "billing", "service-requests", "inspections"},
}


def _role_value(user: User) -> str:
    role = getattr(user, "role", "")
    return getattr(role, "value", role) or ""


def _canonical_module(module: str) -> str:
    return MODULE_ALIASES.get(module, module)


def _saved_rule(user: User, module: str) -> Optional[dict[str, Any]]:
    permissions = user.permissions or {}
    if not isinstance(permissions, dict):
        return None
    module = _canonical_module(module)
    rule = permissions.get(module)
    if isinstance(rule, dict):
        return rule
    for raw_key, raw_rule in permissions.items():
        if _canonical_module(str(raw_key)) == module and isinstance(raw_rule, dict):
            return raw_rule
    return None


def has_module_permission(user: User, module: str, action: PermissionAction = "index") -> bool:
    """Return whether a user can perform a module action.

    Saved per-user permission rules override role defaults. When no saved rule is
    present, role defaults match the frontend permission model.
    """
    module = _canonical_module(module)
    rule = _saved_rule(user, module)
    if rule is not None:
        return bool(rule.get(action))

    role = _role_value(user)
    allowed = module in ROLE_MODULES.get(role, set())
    if action in {"index", "view"}:
        return allowed
    if action in {"add", "edit"}:
        return allowed and (
            role in {"superadmin", "admin", "facility_admin", "facility_manager"}
            or (role == "technician" and module in {"service-requests", "inspections", "chat"})
            or (role == "employee" and module in {"my-timesheets", "my-leave"})
            or (role == "client" and module in {"billing", "service-requests"})
        )
    if action == "delete":
        return role in {"superadmin", "admin"}
    return False


def require_module_permission(user: User, module: str, action: PermissionAction = "index") -> None:
    if not has_module_permission(user, module, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permission: {module}.{action}",
        )
