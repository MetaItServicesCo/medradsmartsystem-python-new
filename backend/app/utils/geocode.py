"""Turn a check-in's position into an address, via OpenStreetMap Nominatim.

The same service Tracker used. Best-effort and off the request path: it runs
just after the mark is saved, and any failure only leaves the address empty -
the mark and its position are kept either way.

Nominatim's usage policy: at most one request a second, with a User-Agent that
names the application. Volume here is one lookup per self check-in or
check-out; nearby positions (within about ten metres) reuse an earlier answer.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import httpx

from app.core.config import settings
from app.db.base import SessionLocal

logger = logging.getLogger("medrad.geocode")

_TIMEOUT_SECONDS = 8.0
_MIN_INTERVAL_SECONDS = 1.1
_CACHE_SIZE = 512
STREET_ZOOM = 18
AREA_ZOOM = 14
# A position rougher than this is named by its area: a laptop placed to within
# a few kilometres must not read as being at one exact street address.
ROUGH_ACCURACY_METRES = 500

_lock = threading.Lock()
_last_request = 0.0
_cache: "OrderedDict[tuple[float, float], str]" = OrderedDict()


def _cache_key(lat: float, lon: float, zoom: int) -> tuple[float, float, int]:
    return round(lat, 4), round(lon, 4), zoom


def reverse_geocode(lat: float, lon: float, zoom: int = STREET_ZOOM) -> Optional[str]:
    """The address at a position, or None if it cannot be had right now."""
    global _last_request
    key = _cache_key(lat, lon, zoom)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
    try:
        response = httpx.get(
            settings.GEOCODER_REVERSE_URL,
            params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": zoom},
            headers={"User-Agent": settings.GEOCODER_USER_AGENT, "Accept-Language": "en"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        place = (response.json() or {}).get("display_name")
    except Exception as exc:  # a miss only means no address is shown
        logger.info("Reverse geocoding failed: %s", exc)
        return None
    if not place or not isinstance(place, str):
        return None
    place = place.strip()[:255]
    with _lock:
        _cache[key] = place
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return place


# One worker of its own, not the request's background tasks: on this FastAPI a
# request keeps its database connection until its background tasks finish, and
# a lookup can take seconds. One worker also keeps to one lookup at a time.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="geocode")
_submit = _executor.submit


def schedule_attendance_place(event_id: int) -> None:
    """Name the place of an attendance mark soon, without holding up anything."""
    if not settings.ATTENDANCE_GEOCODING_ENABLED:
        return
    try:
        _submit(fill_attendance_place, event_id)
    except RuntimeError:  # the worker is shutting down with the process
        logger.info("Geocoding skipped for attendance mark %s: shutting down", event_id)


def fill_attendance_place(event_id: int) -> None:
    """Name the place of one attendance mark. Holds a database connection only
    to read the position and to write the address, never during the lookup."""
    if not settings.ATTENDANCE_GEOCODING_ENABLED:
        return
    from app.models.attendance import AttendanceEvent

    db = SessionLocal()
    try:
        event = db.query(AttendanceEvent).filter(AttendanceEvent.id == event_id).first()
        if event is None or event.latitude is None or event.longitude is None or event.location_place:
            return
        lat, lon, accuracy = event.latitude, event.longitude, event.location_accuracy_m
    finally:
        db.close()

    rough = accuracy is not None and accuracy > ROUGH_ACCURACY_METRES
    place = reverse_geocode(lat, lon, AREA_ZOOM if rough else STREET_ZOOM)
    if not place:
        return

    db = SessionLocal()
    try:
        db.query(AttendanceEvent).filter(
            AttendanceEvent.id == event_id, AttendanceEvent.location_place.is_(None),
        ).update({"location_place": place}, synchronize_session=False)
        db.commit()
    except Exception:
        logger.exception("Could not save the place of attendance mark %s", event_id)
        db.rollback()
    finally:
        db.close()
