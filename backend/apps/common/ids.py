"""UUIDv7 (RFC 9562): 48-bit Unix milliseconds + random bits.

Time-ordered, so new rows land at the end of the primary-key index
instead of at random positions, and clients can still create ids offline.
Python 3.10 has no uuid.uuid7(), hence this small implementation.
"""
import os
import time
import uuid


def uuid7() -> uuid.UUID:
    ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    rand_a = rand >> 68 & 0xFFF           # 12 bits
    rand_b = rand & ((1 << 62) - 1)       # 62 bits
    value = (ms & ((1 << 48) - 1)) << 80 | 0x7 << 76 | rand_a << 64 | 0b10 << 62 | rand_b
    return uuid.UUID(int=value)
