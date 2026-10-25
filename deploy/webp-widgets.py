"""PNG widget pictures from deploy/make-widget-previews.js -> the Android
app's WebP previews (android:previewImage), transparent corners kept.

    python -I deploy/webp-widgets.py
"""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "dist", "widget-previews")
OUT = os.path.join(HERE, "..", "android", "app", "src", "main", "res", "drawable-nodpi")
os.makedirs(OUT, exist_ok=True)

for png in sorted(glob.glob(os.path.join(SRC, "widget-*.png"))):
    name = "widget_preview_" + os.path.basename(png)[len("widget-"):-4]
    dest = os.path.join(OUT, name + ".webp")
    Image.open(png).convert("RGBA").save(dest, "WEBP", quality=85, method=6)
    print(dest, os.path.getsize(dest) // 1024, "KB")
