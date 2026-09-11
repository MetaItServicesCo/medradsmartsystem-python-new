"""Shared file handling for compliance certificates and permit documents.

Both are evidence: the scanned elevator certificate a surveyor asks to see, the
signed ICRA taped to the barrier. Neither is a large file and neither needs the
encrypted-at-rest machinery that payment proofs use, but both need the same
three things — a size cap, a type allowlist, and a stored name that cannot be
used to escape the upload directory.

Factored out rather than copied a third time. The floor-plan endpoint predates
this and keeps its own copy because its limits are genuinely different: a
life-safety drawing is sixty megabytes and a certificate is not.
"""
from __future__ import annotations

import os
import uuid

from fastapi import HTTPException, UploadFile, status

# Certificates and permits are scans and PDFs. Ten megabytes is generous for
# both, and small enough that a mis-selected video is rejected rather than
# quietly filling the disk.
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

ALLOWED_EVIDENCE_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/tiff",
}

_EXTENSION_BY_TYPE = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/tiff": ".tif",
}


def upload_root(subdirectory: str) -> str:
    """Resolve `backend/uploads/<subdirectory>`.

    Matches the convention the facility-document and floor-plan endpoints use,
    which matters because `./backend:/app` is what makes uploads survive a
    container restart.
    """
    return os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads", subdirectory,
    )


async def store_evidence(file: UploadFile, subdirectory: str) -> tuple[str, str, int]:
    """Validate and write an uploaded file.

    Returns `(stored_relative_path, original_filename, size_bytes)`.

    The stored name is a fresh UUID with an extension derived from the declared
    content type, never from the client's filename: a name is attacker-supplied
    and the only safe thing to do with it is record it and not use it as a path.
    """
    if file.content_type not in ALLOWED_EVIDENCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Allowed: PDF, PNG, JPEG, WebP, TIFF."
            ),
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is empty")
    if len(content) > MAX_EVIDENCE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_EVIDENCE_BYTES // (1024 * 1024)}MB limit",
        )

    directory = upload_root(subdirectory)
    os.makedirs(directory, exist_ok=True)

    extension = _EXTENSION_BY_TYPE.get(file.content_type, "")
    stored_name = f"{uuid.uuid4().hex}{extension}"
    with open(os.path.join(directory, stored_name), "wb") as handle:
        handle.write(content)

    return f"/uploads/{subdirectory}/{stored_name}", (file.filename or "document"), len(content)


def resolve_evidence(stored_path: str | None, subdirectory: str) -> str:
    """Turn a stored reference back into an absolute path, or refuse.

    Delegates the traversal check to `protected_upload_path`, which is already
    the project's answer to this and has been reviewed as such.
    """
    from app.utils.upload_security import protected_upload_path

    if not stored_path:
        raise HTTPException(status_code=404, detail="No file on record")

    try:
        path = protected_upload_path(
            upload_root(subdirectory), os.path.basename(stored_path), subdirectory,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found")

    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return path
