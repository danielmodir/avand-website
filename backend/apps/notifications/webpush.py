"""Web Push sending (RFC 8291 + VAPID) through pywebpush — the same
messages backend-php/lib/push.php sends on the live host.

The VAPID key pair comes from settings (VAPID_PRIVATE_KEY: an EC P-256
private key in PEM). Without one — local development — a pair is made
once and kept in local_data/vapid.json (git-ignored)."""
import base64
import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings

TTL_SECONDS = 6 * 3600
PUSH_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@lru_cache(maxsize=1)
def vapid_keys() -> tuple[str, str]:
    """(private key PEM, public key as base64url raw point)."""
    pem = getattr(settings, "VAPID_PRIVATE_KEY", "") or ""
    if not pem:
        path = Path(settings.BASE_DIR) / "local_data" / "vapid.json"
        if path.exists():
            pem = json.loads(path.read_text())["private"]
        else:
            key = ec.generate_private_key(ec.SECP256R1())
            pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"private": pem}))
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return pem, _b64u(public)


def endpoint_allowed(url: str) -> bool:
    """Only the big browser push services: the server never posts to an
    address a client made up."""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme != "https" or p.username or p.port:
        return False
    return any(host == h or host.endswith("." + h) for h in PUSH_HOSTS)


def send(sub, message: dict) -> int:
    """One message to one subscription; returns the HTTP status (0: no answer)."""
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    pem, _ = vapid_keys()
    try:
        res = webpush(
            {"endpoint": sub.token, "keys": {"p256dh": sub.web_p256dh, "auth": sub.web_auth}},
            data=json.dumps(message, ensure_ascii=False),
            vapid_private_key=Vapid.from_pem(pem.encode()),
            vapid_claims={"sub": "mailto:support@toojibee.ir"},
            ttl=TTL_SECONDS,
            timeout=12,
            headers={"Urgency": "high"},
        )
        return res.status_code
    except WebPushException as e:
        return e.status_code or 0
    except OSError:  # requests' connection errors and timeouts
        return 0
