from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, Request, status

from app.core.deps import get_current_user
from app.models.user import User
from app.utils.permissions import has_module_permission


PermissionAction = Literal["index", "view", "add", "edit", "delete"]
PermissionRequirement = tuple[str, PermissionAction]
PermissionGroup = tuple[PermissionRequirement, ...]


@dataclass(frozen=True)
class PermissionRouteRule:
    """Path-aware permission override for shared or non-CRUD endpoints.

    `any_of` is a sequence of groups. A group may contain one or more
    requirements. Any single group passing authorizes the request; every
    requirement inside that group must pass.
    """

    any_of: tuple[PermissionGroup, ...]
    methods: frozenset[str] | None = None
    contains: str | None = None
    startswith: str | None = None
    endswith: str | None = None


def _default_action_for_method(method: str) -> PermissionAction:
    method = method.upper()
    if method in {"GET", "HEAD", "OPTIONS"}:
        return "view"
    if method == "POST":
        return "add"
    if method in {"PUT", "PATCH"}:
        return "edit"
    if method == "DELETE":
        return "delete"
    return "index"


def _normalize_group(group: Sequence[PermissionRequirement]) -> PermissionGroup:
    return tuple((module, action) for module, action in group)


def allow_any(*requirements: PermissionRequirement) -> tuple[PermissionGroup, ...]:
    """Authorize when any one module/action requirement is present."""

    return tuple(((module, action),) for module, action in requirements)


def allow_all(*requirements: PermissionRequirement) -> tuple[PermissionGroup, ...]:
    """Authorize only when all listed module/action requirements are present."""

    return (_normalize_group(requirements),)


def route_rule(
    *requirements: PermissionRequirement,
    methods: Iterable[str] | None = None,
    contains: str | None = None,
    startswith: str | None = None,
    endswith: str | None = None,
    any_of: tuple[PermissionGroup, ...] | None = None,
) -> PermissionRouteRule:
    return PermissionRouteRule(
        any_of=any_of or allow_any(*requirements),
        methods=frozenset(method.upper() for method in methods) if methods else None,
        contains=contains,
        startswith=startswith,
        endswith=endswith,
    )


def _matches(rule: PermissionRouteRule, method: str, path: str) -> bool:
    if rule.methods is not None and method.upper() not in rule.methods:
        return False
    if rule.contains and rule.contains not in path:
        return False
    if rule.startswith and not path.startswith(rule.startswith):
        return False
    if rule.endswith and not path.endswith(rule.endswith):
        return False
    return True


def _has_group(user: User, group: PermissionGroup) -> bool:
    return all(has_module_permission(user, module, action) for module, action in group)


def _format_requirements(any_of: tuple[PermissionGroup, ...]) -> str:
    return " or ".join(
        " + ".join(f"{module}.{action}" for module, action in group)
        for group in any_of
    )


def require_module_access(
    module: str,
    *,
    rules: Sequence[PermissionRouteRule] = (),
    skip_contains: Sequence[str] = (),
):
    """FastAPI dependency factory that enforces the saved permission matrix.

    This dependency is intentionally module/action based, not role based. Roles
    still provide defaults through `has_module_permission`, but a user's saved
    matrix overrides those defaults.
    """

    def checker(
        request: Request,
        current_user: User = Depends(get_current_user),
    ) -> User:
        path = request.scope.get("path", "")
        method = request.method.upper()

        if any(fragment in path for fragment in skip_contains):
            return current_user

        for rule in rules:
            if _matches(rule, method, path):
                if any(_has_group(current_user, group) for group in rule.any_of):
                    return current_user
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permission: {_format_requirements(rule.any_of)}",
                )

        action = _default_action_for_method(method)
        requirement = ((module, action),)
        if _has_group(current_user, requirement):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permission: {module}.{action}",
        )

    return checker
