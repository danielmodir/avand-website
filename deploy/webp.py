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

for png in sorted(glob.glob(os.path.join(SRC, "desk-*.png"))):
    im = Image.open(png).convert("RGB")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    out = os.path.join(OUT, os.path.basename(png)[:-4] + ".webp")
    im.save(out, "WEBP", quality=74, method=6)
    print(os.path.basename(out), os.path.getsize(out) // 1024, "KB")
