from __future__ import annotations

from pathlib import Path
from typing import Protocol

from shared.enums import EncryptionBackend
from shared.models import EncryptionKey


class EncryptionProvider(Protocol):
    """Minimal interface for file encryption backends."""

    def encrypt_file(self, input_path: Path, output_path: Path) -> None:
        """Encrypt input_path and write to output_path. Raises on failure."""
        ...

    def decrypt_file(self, input_path: Path, output_path: Path) -> None:
        """Decrypt input_path and write to output_path. Raises on failure."""
        ...

    def validate_config(self) -> None:
        """Check that the backend is properly configured. Raises RuntimeError if not."""
        ...


def get_encryption_provider(key: EncryptionKey) -> EncryptionProvider:
    """Factory: return the right provider for the given encryption key."""
    if key.backend == EncryptionBackend.GPG:
        from .gpg import GpgEncryptionProvider

        return GpgEncryptionProvider(key.key_data)

    raise ValueError(f"Unknown encryption backend: {key.backend}")
