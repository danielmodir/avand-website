"""AES-256-GCM envelope encryption for the period database.

Ciphertext layout everywhere: 12-byte nonce || ciphertext || 16-byte tag.
Associated data binds each value to where it belongs, so a ciphertext
copied into another row or another user's account fails to decrypt.
"""
import base64
import json
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

NONCE_BYTES = 12


@lru_cache(maxsize=1)
def master_keys():
    """{version: 32-byte key} from PERIOD_KEKS="1:<base64>,2:<base64>"."""
    keys = {}
    for part in filter(None, (p.strip() for p in settings.PERIOD_KEKS.split(","))):
        version, _, value = part.partition(":")
        key = base64.b64decode(value)
        if len(key) != 32:
            raise ImproperlyConfigured(f"PERIOD_KEKS version {version} is not 32 bytes")
        keys[int(version)] = key
    if settings.PERIOD_KEK_CURRENT not in keys:
        raise ImproperlyConfigured("PERIOD_KEK_CURRENT has no key in PERIOD_KEKS")
    return keys


def _seal(key: bytes, plaintext: bytes, aad: bytes) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, aad)


def _open(key: bytes, blob: bytes, aad: bytes) -> bytes:
    blob = bytes(blob)
    return AESGCM(key).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], aad)


def new_wrapped_dek(user_id):
    """Returns (wrapped_dek, kek_version) for a fresh random data key."""
    version = settings.PERIOD_KEK_CURRENT
    dek = AESGCM.generate_key(bit_length=256)
    return _seal(master_keys()[version], dek, f"period-dek:{user_id}".encode()), version


def unwrap_dek(user_key) -> bytes:
    return _open(master_keys()[user_key.kek_version], user_key.wrapped_dek, f"period-dek:{user_key.user_id}".encode())


def encrypt_json(dek, data, table, row_id, user_id) -> bytes:
    return _seal(dek, json.dumps(data, separators=(",", ":")).encode(), f"{table}:{row_id}:{user_id}".encode())


def decrypt_json(dek, blob, table, row_id, user_id):
    return json.loads(_open(dek, blob, f"{table}:{row_id}:{user_id}".encode()))
