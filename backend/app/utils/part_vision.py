"""Recognising a part from a photograph of it.

A descriptor is computed for every reference photograph and compared against
the photograph just taken. What comes back is a ranked list of candidates for
someone to confirm -- never an answer applied on its own. Two control boxes
from one manufacturer look alike, the same box looks different under different
light, and silently inheriting the details of a wrong match would mislabel
stock in a way nobody notices until it matters.

Built from Pillow and numpy, both already installed. A convolutional embedding
would discriminate better and is the obvious upgrade, but it means a model file,
another runtime and inference on a shared four-core host; this needs none of
that, runs in about twenty milliseconds, and can be swapped out behind the same
two functions. The descriptor is versioned so that when it is swapped, stored
vectors computed by the old one can be told apart and recomputed rather than
silently compared against vectors that mean something else.

What it measures:

* colour, as a hue/saturation/value histogram -- the strongest single signal
  for "is this the same object", and stable across small movements.
* coarse shape, as gradient orientations over a grid -- what the outline and
  the markings look like, which is what separates two boxes of the same colour.
"""
from __future__ import annotations

import logging
import math
from io import BytesIO
from typing import Optional, Sequence

import numpy as np
from PIL import Image, ImageOps


logger = logging.getLogger("medrad.part_vision")

# Bump when the descriptor changes. Stored vectors carry the version they were
# computed with, so a change makes them recomputable instead of quietly wrong.
EMBEDDING_MODEL = "hsvhog-v2"

# Small enough to be quick, large enough that markings survive.
_SIZE = 160
# Hue and saturation only. Brightness is deliberately not binned: dimming a
# photograph moves every pixel into a different value bin, so the first
# version scored a part against itself at zero the moment the light changed.
# What colour something is survives the lighting; how bright it is does not.
_HUE_BINS, _SAT_BINS = 16, 8
_GRID = 4
_ORIENTATION_BINS = 9

_DIMENSIONS = _HUE_BINS * _SAT_BINS + _GRID * _GRID * _ORIENTATION_BINS


def _prepare(data: bytes) -> Image.Image:
    image = Image.open(BytesIO(data))
    # Phones record orientation in metadata rather than rotating the pixels, so
    # the same object photographed upright and sideways would otherwise produce
    # two unrelated descriptors.
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB").resize((_SIZE, _SIZE), Image.BILINEAR)


def _colour_histogram(image: Image.Image) -> np.ndarray:
    hsv = np.asarray(image.convert("HSV"), dtype=np.float32)
    hue = np.clip((hsv[..., 0] / 256.0 * _HUE_BINS).astype(np.int32), 0, _HUE_BINS - 1)
    sat = np.clip((hsv[..., 1] / 256.0 * _SAT_BINS).astype(np.int32), 0, _SAT_BINS - 1)
    flat = hue * _SAT_BINS + sat
    counts = np.bincount(flat.ravel(), minlength=_HUE_BINS * _SAT_BINS)
    return counts.astype(np.float32)


def _shape_histogram(image: Image.Image) -> np.ndarray:
    grey = np.asarray(image.convert("L"), dtype=np.float32)
    # Central differences; the edges are dropped rather than padded, since a
    # padded edge invents a gradient that is not in the photograph.
    dy = np.zeros_like(grey)
    dx = np.zeros_like(grey)
    dy[1:-1, :] = grey[2:, :] - grey[:-2, :]
    dx[:, 1:-1] = grey[:, 2:] - grey[:, :-2]

    magnitude = np.sqrt(dx * dx + dy * dy)
    # Unsigned orientation: a dark-on-light edge and its light-on-dark twin are
    # the same edge, and which way round depends only on the background.
    angle = np.arctan2(dy, dx) % math.pi
    bucket = np.clip(
        (angle / math.pi * _ORIENTATION_BINS).astype(np.int32), 0, _ORIENTATION_BINS - 1
    )

    cell = _SIZE // _GRID
    out = np.zeros(_GRID * _GRID * _ORIENTATION_BINS, dtype=np.float32)
    for row in range(_GRID):
        for col in range(_GRID):
            sl = (slice(row * cell, (row + 1) * cell), slice(col * cell, (col + 1) * cell))
            weights = np.bincount(
                bucket[sl].ravel(),
                weights=magnitude[sl].ravel(),
                minlength=_ORIENTATION_BINS,
            )
            start = (row * _GRID + col) * _ORIENTATION_BINS
            out[start:start + _ORIENTATION_BINS] = weights
    return out


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else vector


def _signature(counts: np.ndarray) -> np.ndarray:
    """Turn raw counts into something that discriminates.

    Most of any photograph is background, so one bin holds most of the
    mass and every descriptor ends up pointing in almost the same
    direction -- the first version scored two unrelated parts at 0.95.
    Taking the square root of the proportions (the Hellinger transform)
    flattens that peak, so the parts of the picture that differ are the
    parts that decide the comparison.
    """
    total = float(counts.sum())
    if total <= 0:
        return counts
    return _unit(np.sqrt(counts / total))


def embed_image(data: bytes) -> Optional[list[float]]:
    """Describe a photograph, or return None if it cannot be read.

    Never raises: an unreadable photograph means this part is not
    recognisable, which is a smaller problem than a capture that fails.
    """
    try:
        image = _prepare(data)
    except Exception as exc:
        # Expected often enough -- a truncated upload, a format Pillow does
        # not read -- that a stack trace per occurrence is noise.
        logger.info("Could not read a photograph for recognition: %s", exc)
        return None

    try:
        # Each half is normalised before being joined, so a photograph with
        # strong edges cannot drown out its own colour, or the reverse.
        colour = _signature(_colour_histogram(image))
        shape = _signature(_shape_histogram(image))
        return _unit(np.concatenate([colour, shape])).astype(np.float32).tolist()
    except Exception:
        logger.warning("Could not describe a photograph", exc_info=True)
        return None


def similarity(left: Sequence[float], right: Sequence[float]) -> float:
    """How alike two descriptors are, from 0 to 1.

    Both are already unit length, so this is their dot product, clamped
    because floating point occasionally reports 1.0000001.
    """
    if not left or not right or len(left) != len(right):
        return 0.0
    a = np.asarray(left, dtype=np.float32)
    b = np.asarray(right, dtype=np.float32)
    return float(np.clip(np.dot(a, b), 0.0, 1.0))


# How far ahead of the runner-up the best match must be before it is worth
# suggesting. Measured rather than guessed: a correct match under poor
# conditions can score lower in absolute terms than a wrong match under good
# ones, so an absolute threshold cannot tell them apart. What does separate
# them is standing out from the field -- a real match beats its rivals, a
# false one sits in a crowd of near-identical scores.
_CONFIDENT_MARGIN = 0.04


def rank_candidates(
    query: Sequence[float],
    known: Sequence[tuple[int, Sequence[float]]],
    limit: int = 5,
    floor: float = 0.55,
) -> list[tuple[int, float]]:
    """The most alike definitions, best first.

    A floor drops the obviously unrelated. It does not decide correctness:
    these scores are not comparable between photographs, only within one.
    """
    scored = [
        (identifier, similarity(query, vector))
        for identifier, vector in known
        if vector
    ]
    scored = [pair for pair in scored if pair[1] >= floor]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:limit]


def is_confident(ranked: Sequence[tuple[int, float]]) -> bool:
    """Whether the best candidate is worth putting in front of someone.

    Only ever advisory. Nothing is applied on this: a confident match
    pre-selects a suggestion that still has to be accepted, and an
    unconfident one shows the same list with nothing chosen. The cost of
    being wrong here is a mislabelled part that nobody notices, so the
    decision stays with a person either way.
    """
    if not ranked:
        return False
    if len(ranked) == 1:
        return ranked[0][1] >= 0.70
    return ranked[0][1] - ranked[1][1] >= _CONFIDENT_MARGIN


def dimensions() -> int:
    return _DIMENSIONS
