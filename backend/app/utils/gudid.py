"""Turn a decoded barcode into what the manufacturer registered it as.

A GTIN read off a label is an exact identifier and, on its own, still just a
number. GUDID -- the FDA's device identification database, served through
openFDA -- is where that number becomes a brand name, a company, a model and a
description of what the device actually is. No key, no account, no cost.

This is the one place in the capture path that reaches outside the building, so
it is short-tempered about it: a tight timeout, one attempt, a small cache, and
a switch to turn it off. A stock list that cannot be added to because a public
API is slow today would be a bad trade for a field that was going to be checked
by a person anyway.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger("medrad.gudid")

_ENDPOINT = "https://api.fda.gov/device/udi.json"

# Small and process-local on purpose. The same GTIN recurs constantly while
# somebody captures a box of identical items, and never needs to survive a
# restart.
_CACHE: dict[str, Optional[dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_LIMIT = 512


def gudid_enabled() -> bool:
    return bool(getattr(settings, "UDI_LOOKUP_ENABLED", True))


def _summarise(record: dict[str, Any]) -> dict[str, Any]:
    """The handful of fields that answer 'what exactly is this part'."""
    terms = [
        str(term.get("name")).strip()
        for term in (record.get("gmdn_terms") or [])
        if term.get("name")
    ]
    identifiers = [
        {
            "id": str(entry.get("id") or "").strip(),
            "type": str(entry.get("type") or "").strip(),
            "issuing_agency": str(entry.get("issuing_agency") or "").strip(),
        }
        for entry in (record.get("identifiers") or [])
        if entry.get("id")
    ]
    return {
        # brand_name is what it is called; company_name is who made it.
        "brand_name": (record.get("brand_name") or "").strip() or None,
        "company_name": (record.get("company_name") or "").strip() or None,
        "model": (record.get("version_or_model_number") or "").strip() or None,
        "catalog_number": (record.get("catalog_number") or "").strip() or None,
        # The GMDN term is the plain description of what the device is, which
        # is usually a better part description than the brand name.
        "description": (
            (record.get("device_description") or "").strip()
            or (terms[0] if terms else None)
        ),
        "gmdn_terms": terms[:3],
        "identifiers": identifiers,
        "single_use": bool(record.get("is_single_use")),
        "prescription": bool(record.get("is_rx")),
    }


def _query(gtin: str) -> Optional[dict[str, Any]]:
    import httpx

    params = {"search": 'identifiers.id:"{}"'.format(gtin), "limit": 1}
    try:
        response = httpx.get(
            _ENDPOINT,
            params=params,
            timeout=float(getattr(settings, "UDI_LOOKUP_TIMEOUT_SECONDS", 6.0)),
            headers={"User-Agent": "medrad-inventory-capture"},
        )
    except Exception:
        # Network trouble is not a capture failure. The photograph, the code
        # and the barcode fields are all already stored.
        logger.info("gudid: lookup failed for %s", gtin, exc_info=True)
        return None

    if response.status_code == 404:
        return None  # a real answer: this identifier is not registered
    if response.status_code != 200:
        logger.info("gudid: %s returned %s", gtin, response.status_code)
        return None

    try:
        results = (response.json() or {}).get("results") or []
    except ValueError:
        logger.info("gudid: %s returned unparseable JSON", gtin)
        return None
    if not results:
        return None
    return _summarise(results[0])


def lookup_gtin(gtin: Optional[str]) -> Optional[dict[str, Any]]:
    """What this identifier is registered as, or None.

    None means three different things -- not registered, lookup switched off,
    or the network was unreachable -- and the caller treats all three the same
    way, because in every case the person still has to describe the part.
    """
    if not gtin or not gudid_enabled():
        return None

    with _CACHE_LOCK:
        if gtin in _CACHE:
            return _CACHE[gtin]

    found = _query(gtin)
    # A GTIN carrying a leading zero is sometimes registered without it, so a
    # miss is retried once on the unpadded form before being believed.
    if found is None:
        trimmed = gtin.lstrip("0")
        if trimmed and trimmed != gtin:
            found = _query(trimmed)

    with _CACHE_LOCK:
        if len(_CACHE) >= _CACHE_LIMIT:
            _CACHE.clear()
        _CACHE[gtin] = found
    return found
