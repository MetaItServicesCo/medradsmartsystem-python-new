from __future__ import annotations

import os
from pathlib import PurePosixPath
from typing import Iterable
from urllib.parse import urlsplit

from starlette.responses import Response
from starlette.staticfiles import StaticFiles


# Only presentation media that is intentionally usable by unauthenticated
# document surfaces may be served by the static mount. Every new upload subtree
# is private by default until an explicit access policy is implemented.
PUBLIC_UPLOAD_SUBTREES = frozenset({"profile_pictures", "test_equipment"})


class PublicUploadsStaticFiles(StaticFiles):
    """Deny-by-default static upload server.

    Sensitive files must be returned by an authenticated endpoint that can
    validate access to the owning database record. Keeping the allowlist here
    prevents a newly introduced upload directory from becoming public merely
    because it lives below ``uploads/``.
    """

    def __init__(self, *args, public_subtrees: Iterable[str] = PUBLIC_UPLOAD_SUBTREES, **kwargs):
        super().__init__(*args, **kwargs)
        self.public_subtrees = frozenset(public_subtrees)

    async def get_response(self, path: str, scope) -> Response:
        normalized = path.replace("\\", "/").lstrip("/")
        parts = PurePosixPath(normalized).parts
        if not parts or ".." in parts or parts[0] not in self.public_subtrees:
            # Return the same non-disclosing response for missing and protected
            # files; callers cannot use this route to enumerate private media.
            return Response(status_code=404, headers={"Cache-Control": "no-store"})
        return await super().get_response(normalized, scope)


def protected_upload_path(upload_dir: str, stored_value: str, expected_subtree: str) -> str:
    """Resolve a stored upload reference without allowing path traversal."""

    raw_path = urlsplit(stored_value or "").path.replace("\\", "/")
    expected_prefix = f"/uploads/{expected_subtree}/"
    if raw_path.startswith(expected_prefix):
        raw_name = raw_path[len(expected_prefix):]
    else:
        candidate_reference = PurePosixPath(raw_path)
        if len(candidate_reference.parts) != 1:
            raise ValueError("Invalid stored upload path")
        raw_name = candidate_reference.name

    candidate_name = PurePosixPath(raw_name)
    if (
        not raw_name
        or candidate_name.is_absolute()
        or len(candidate_name.parts) != 1
        or candidate_name.name in {".", ".."}
    ):
        raise ValueError("Invalid stored upload path")

    root = os.path.realpath(upload_dir)
    candidate = os.path.realpath(os.path.join(root, candidate_name.name))
    if os.path.commonpath((root, candidate)) != root:
        raise ValueError("Invalid stored upload path")
    return candidate
