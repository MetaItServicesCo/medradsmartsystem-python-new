"""Turning a traced room outline into square feet.

A pin says where a room is. A polygon says how big it is — and once the floor
plan has been calibrated, the area falls straight out of the trace with no
tape measure involved. That matters beyond tidiness: area times ceiling height
is volume, and volume is what an air-changes-per-hour check needs. Without it,
somebody has to measure four hundred rooms by hand or the ventilation
compliance number cannot be computed at all.

Vertices are stored as fractions of the image (0..1), like pins, so
re-rendering the source at a different resolution does not distort anything.
Converting to feet therefore needs both the calibration and the source
dimensions, and this module refuses rather than guesses when either is absent.
"""
from __future__ import annotations

MIN_VERTICES = 3


def normalise(polygon) -> list[tuple[float, float]]:
    """Accept either [{'x':..,'y':..}, ...] or [[x, y], ...]."""
    points: list[tuple[float, float]] = []
    for vertex in polygon or []:
        if isinstance(vertex, dict):
            x, y = vertex.get("x"), vertex.get("y")
        elif isinstance(vertex, (list, tuple)) and len(vertex) >= 2:
            x, y = vertex[0], vertex[1]
        else:
            continue
        if x is None or y is None:
            continue
        points.append((float(x), float(y)))
    return points


def is_valid(polygon) -> bool:
    return len(normalise(polygon)) >= MIN_VERTICES


def shoelace_area(points: list[tuple[float, float]]) -> float:
    """Area of a simple polygon, in the units the coordinates are given in.

    The shoelace formula. Absolute value taken so the winding direction of the
    trace does not matter — an operator drawing clockwise and one drawing
    anticlockwise should get the same room.

    A self-intersecting outline would give the difference of its two lobes
    rather than their sum, so callers screen for that with
    `is_self_intersecting` before trusting the result.
    """
    if len(points) < MIN_VERTICES:
        return 0.0

    total = 0.0
    count = len(points)
    for index in range(count):
        x1, y1 = points[index]
        x2, y2 = points[(index + 1) % count]
        total += (x1 * y2) - (x2 * y1)
    return abs(total) / 2.0


def area_sqft(
    polygon,
    *,
    scale_ft_per_px: float | None,
    width_px: int | None,
    height_px: int | None,
) -> float | None:
    """Convert a traced outline into square feet.

    Returns None rather than a number when the plan has not been calibrated or
    its source dimensions are unknown. A silently wrong area would propagate
    into volume and then into an air-change calculation that reads as compliant,
    which is precisely the class of failure the unit rules elsewhere exist to
    prevent.
    """
    points = normalise(polygon)
    if len(points) < MIN_VERTICES:
        return None
    if not scale_ft_per_px or not width_px or not height_px:
        return None

    # Fractions -> source pixels. The two axes scale differently because the
    # image is rarely square, so this cannot be done with a single factor.
    in_pixels = [(x * float(width_px), y * float(height_px)) for x, y in points]

    pixel_area = shoelace_area(in_pixels)
    # Area scales with the square of a linear factor.
    return round(pixel_area * (float(scale_ft_per_px) ** 2), 2)


def perimeter_ft(
    polygon,
    *,
    scale_ft_per_px: float | None,
    width_px: int | None,
    height_px: int | None,
) -> float | None:
    """Traced perimeter in feet — useful for estimating wall finishes and for
    sanity-checking a trace whose area looks wrong."""
    points = normalise(polygon)
    if len(points) < MIN_VERTICES:
        return None
    if not scale_ft_per_px or not width_px or not height_px:
        return None

    in_pixels = [(x * float(width_px), y * float(height_px)) for x, y in points]
    total = 0.0
    for index in range(len(in_pixels)):
        x1, y1 = in_pixels[index]
        x2, y2 = in_pixels[(index + 1) % len(in_pixels)]
        total += ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    return round(total * float(scale_ft_per_px), 2)


def centroid(polygon) -> tuple[float, float] | None:
    """Centre of the traced outline, in the same 0..1 fractions.

    Used to place the room's pin automatically when it is traced rather than
    dropped, so a traced room still appears on the board and in search without
    anybody placing a second marker.
    """
    points = normalise(polygon)
    if not points:
        return None
    if len(points) < MIN_VERTICES:
        x, y = points[0]
        return (x, y)

    # Area-weighted centroid, not the mean of the vertices: a room traced with
    # ten points along one wall and two along another would otherwise put its
    # marker against the detailed wall.
    cx = cy = area_twice = 0.0
    count = len(points)
    for index in range(count):
        x1, y1 = points[index]
        x2, y2 = points[(index + 1) % count]
        cross = (x1 * y2) - (x2 * y1)
        area_twice += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross

    if abs(area_twice) < 1e-12:
        # Degenerate (collinear) trace — fall back to the mean.
        return (
            sum(x for x, _ in points) / count,
            sum(y for _, y in points) / count,
        )

    factor = 1.0 / (3.0 * area_twice)
    return (cx * factor, cy * factor)


def _segments_cross(
    p1: tuple[float, float], p2: tuple[float, float],
    p3: tuple[float, float], p4: tuple[float, float],
) -> bool:
    """Do segments p1-p2 and p3-p4 properly cross?

    Orientation test. "Properly" excludes touching at a shared endpoint, which
    every adjacent pair of edges in a polygon does by construction.
    """
    def orientation(a, b, c) -> int:
        value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
        if abs(value) < 1e-12:
            return 0
        return 1 if value > 0 else 2

    o1, o2 = orientation(p1, p2, p3), orientation(p1, p2, p4)
    o3, o4 = orientation(p3, p4, p1), orientation(p3, p4, p2)
    return o1 != o2 and o3 != o4 and 0 not in (o1, o2, o3, o4)


def is_self_intersecting(polygon) -> bool:
    """Does the outline cross itself?

    A crossed trace makes the shoelace formula return the difference of the two
    lobes rather than their sum — a number that is not wrong-looking, just
    wrong, and which would propagate into volume and then into an air-change
    calculation that reads as compliant.

    O(n^2), which is fine: a traced room has a handful of corners, and this
    runs once on save.
    """
    points = normalise(polygon)
    count = len(points)
    if count < 4:
        # A triangle cannot cross itself.
        return False

    for i in range(count):
        a1, a2 = points[i], points[(i + 1) % count]
        # Start at i+2 to skip the adjacent edge, which shares an endpoint.
        for j in range(i + 2, count):
            # The last edge is adjacent to the first, so skip that pair too.
            if i == 0 and j == count - 1:
                continue
            b1, b2 = points[j], points[(j + 1) % count]
            if _segments_cross(a1, a2, b1, b2):
                return True
    return False
