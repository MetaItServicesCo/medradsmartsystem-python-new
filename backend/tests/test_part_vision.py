"""Does the recogniser actually recognise things?

Synthetic parts: coloured bodies with distinct markings, then photographed
again under conditions a store room actually produces -- moved, rotated a
little, dimmer, noisier, differently cropped.
"""
import io
import pathlib
import random
import sys

# The backend package, wherever this checkout happens to live.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw, ImageEnhance
from app.utils.part_vision import embed_image, rank_candidates, similarity


def render(body, marking, seed=0, jitter=0, brightness=1.0, rotate=0, noise=0, size=480):
    """A fake part: a coloured body with a marking on it."""
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), (238, 238, 235))
    d = ImageDraw.Draw(img)
    ox = rng.randint(-jitter, jitter) if jitter else 0
    oy = rng.randint(-jitter, jitter) if jitter else 0
    d.rounded_rectangle([90 + ox, 130 + oy, 390 + ox, 350 + oy], radius=24, fill=body)
    for i in range(4):
        d.rectangle([120 + ox + i * 62, 170 + oy, 160 + ox + i * 62, 210 + oy], fill=marking)
    d.ellipse([180 + ox, 250 + oy, 300 + ox, 320 + oy], outline=marking, width=9)
    if rotate:
        img = img.rotate(rotate, fillcolor=(238, 238, 235))
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if noise:
        px = img.load()
        for _ in range(noise):
            x, y = rng.randrange(size), rng.randrange(size)
            px[x, y] = (rng.randrange(256), rng.randrange(256), rng.randrange(256))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def ok(name, passed, extra=""):
    print(("PASS" if passed else "FAIL") + "  " + name + ("  " + extra if extra else ""))


# Three kinds of part, deliberately including two that are similar.
PARTS = {
    "blue pump":   ((38, 84, 160), (250, 250, 250)),
    "grey module": ((110, 112, 118), (40, 40, 40)),
    "blue sensor": ((44, 96, 176), (230, 230, 120)),   # close to the blue pump
}

reference = {name: embed_image(render(*spec, seed=1)) for name, spec in PARTS.items()}
ok("every reference produced a descriptor", all(v for v in reference.values()))
print("   dimensions:", len(next(iter(reference.values()))))
print()

known = [(name, vec) for name, vec in reference.items()]

# The same part, photographed again in conditions a store room produces.
conditions = [
    ("identical shot",        dict(seed=1)),
    ("moved in frame",        dict(seed=7, jitter=26)),
    ("dimmer light",          dict(seed=3, brightness=0.72)),
    ("brighter light",        dict(seed=4, brightness=1.28)),
    ("slightly rotated",      dict(seed=5, rotate=7)),
    ("noisy sensor",          dict(seed=6, noise=5000)),
    ("moved, dim and turned", dict(seed=8, jitter=20, brightness=0.8, rotate=5)),
]

print("recognising the blue pump again:")
worst = 1.0
for label, kwargs in conditions:
    query = embed_image(render(*PARTS["blue pump"], **kwargs))
    ranked = rank_candidates(query, known, limit=3)
    top = ranked[0][0] if ranked else "(nothing)"
    score = ranked[0][1] if ranked else 0.0
    worst = min(worst, score)
    ok("   " + label, top == "blue pump", "top={} score={:.3f}".format(top, score))

print()
ok("worst score still confident", worst > 0.75, "worst={:.3f}".format(worst))

# It must not confuse the two blue parts.
print()
sensor_query = embed_image(render(*PARTS["blue sensor"], seed=9, jitter=18))
ranked = rank_candidates(sensor_query, known, limit=3)
ok("tells two similar blue parts apart",
   ranked and ranked[0][0] == "blue sensor",
   "ranked=" + str([(n, round(s, 3)) for n, s in ranked]))

# Something never seen must not be confidently matched to anything.
print()
stranger = embed_image(render((200, 60, 60), (20, 90, 40), seed=11))
ranked = rank_candidates(stranger, known, limit=3, floor=0.55)
ok("an unknown part is not forced into a match",
   not ranked or ranked[0][1] < 0.9,
   "ranked=" + str([(n, round(s, 3)) for n, s in ranked]) or "nothing")

# Robustness: nothing here may raise on rubbish input.
print()
ok("rubbish bytes return None, not an exception", embed_image(b"not an image") is None)
ok("empty bytes return None", embed_image(b"") is None)
ok("similarity of empty vectors is zero", similarity([], []) == 0.0)
ok("mismatched lengths are zero", similarity([1.0, 0.0], [1.0]) == 0.0)

# What actually matters: does it stand out from the field?
print()
from app.utils.part_vision import is_confident
# Ranking first is the requirement. Confidence only decides whether the top
# candidate is pre-selected, and being unsure on a degraded photograph is
# correct behaviour rather than a failure -- the right part is still offered.
margins = []
for label, kwargs in conditions:
    q = embed_image(render(*PARTS["blue pump"], **kwargs))
    r = rank_candidates(q, known, limit=3)
    margin = (r[0][1] - r[1][1]) if len(r) > 1 else 0
    margins.append(margin)
    ok("   ranks first: " + label, bool(r) and r[0][0] == "blue pump",
       "margin={:.3f}{}".format(margin, "" if is_confident(r) else "  (offered, not pre-selected)"))

r_unknown = rank_candidates(stranger, known, limit=3)
unknown_margin = (r_unknown[0][1] - r_unknown[1][1]) if len(r_unknown) > 1 else 0
ok("NOT confident about an unknown part", not is_confident(r_unknown),
   "margin={:.3f}".format(unknown_margin))
# The property the threshold rests on: a real match stands out further than a
# false one. If these ever overlap, no threshold can separate them.
ok("real matches stand out further than false ones",
   min(margins) > unknown_margin,
   "worst real={:.3f} vs unknown={:.3f}".format(min(margins), unknown_margin))
