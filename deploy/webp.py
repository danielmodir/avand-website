"""PNG screenshots from deploy/make-desk-shots.js -> the landing's WebP
files in frontend/assets/img/ (560 px wide: sharp enough on phones,
about 30 KB each).

    python -I deploy/webp.py
"""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "dist", "desk-shots")
OUT = os.path.join(HERE, "..", "frontend", "assets", "img")
WIDTH = 560

# The hero's phone and wide pictures keep their old names (the admin panel's
# image slots point at them) and are bigger: the phone one is above the fold.
RENAME = {"desk-hero-": ("app-home-mobile-", 600), "desk-desktop-": ("app-home-desktop-", 1600)}

for png in sorted(glob.glob(os.path.join(SRC, "desk-*.png"))):
    name, width = os.path.basename(png)[:-4], WIDTH
    for old, (new, w) in RENAME.items():
        if name.startswith(old):
            name, width = new + name[len(old):], w
    im = Image.open(png).convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = os.path.join(OUT, name + ".webp")
    im.save(out, "WEBP", quality=74, method=6)
    print(os.path.basename(out), os.path.getsize(out) // 1024, "KB")
