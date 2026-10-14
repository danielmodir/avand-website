"""Image uploads: validated, re-encoded to WebP, stored under MEDIA_ROOT.

Re-encoding strips metadata (EXIF location!) and anything that isn't
pixels, so a crafted file can't survive the round trip. The path is
generated server-side and never derived from the uploaded name.
"""
import hashlib
import io
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.common.exceptions import ApiError
from apps.common.ids import uuid7

from ..models import StoredFile

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MODULES_WITH_FILES = {"core", "planning"}
Image.MAX_IMAGE_PIXELS = 40_000_000  # refuse decompression bombs


def store_image(owner, upload, module_key):
    if module_key not in MODULES_WITH_FILES:
        raise ApiError("invalid_module")
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise ApiError("file_too_large", 413)
    try:
        image = Image.open(upload)
        if image.format not in ALLOWED_FORMATS:
            raise ApiError("unsupported_image_type", 415)
        image.verify()
        upload.seek(0)
        image = ImageOps.exif_transpose(Image.open(upload))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ApiError("invalid_image", 400)

    image.thumbnail((settings.MAX_IMAGE_SIDE, settings.MAX_IMAGE_SIDE))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=82, method=6)
    data = buffer.getvalue()
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise ApiError("file_too_large", 413)

    file_id = uuid7()
    now = timezone.now()
    key = f"{module_key}/{now:%Y/%m}/{file_id}.webp"
    path = Path(settings.MEDIA_ROOT) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return StoredFile.objects.create(
        id=file_id, owner=owner, module_key=module_key, storage_key=key,
        original_name=(getattr(upload, "name", "") or "")[:255], mime="image/webp",
        size_bytes=len(data), width=image.width, height=image.height, sha256=hashlib.sha256(data).hexdigest(),
    )


def file_path(stored):
    return Path(settings.MEDIA_ROOT) / stored.storage_key


def delete_physical(stored):
    if stored.storage == StoredFile.Storage.LOCAL:
        file_path(stored).unlink(missing_ok=True)
