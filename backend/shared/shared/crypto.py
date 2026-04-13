"""Application-level field encryption for secrets stored in the database.

Uses Fernet (AES-128-CBC + HMAC-SHA256) keyed off the application secret.
Encrypt on write, decrypt on read. Plain text values from before encryption
was enabled are handled gracefully (returned as-is on failed decryption).
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet_cache: dict[str, Fernet] = {}


def _get_fernet(secret: str) -> Fernet:
    """Derive a Fernet instance from an arbitrary-length secret string."""
    if secret not in _fernet_cache:
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
        _fernet_cache[secret] = Fernet(key)
    return _fernet_cache[secret]


def encrypt_field(value: str, secret: str) -> str:
    """Encrypt a plaintext string. Returns a base64 Fernet token."""
    return _get_fernet(secret).encrypt(value.encode()).decode()


def decrypt_field(value: str, secret: str) -> str:
    """Decrypt a Fernet token. If decryption fails (legacy plain text), returns as-is."""
    try:
        return _get_fernet(secret).decrypt(value.encode()).decode()
    except InvalidToken:
        # Legacy unencrypted value — return as-is
        logger.debug("Fernet decryption failed, treating as plaintext")
        return value
