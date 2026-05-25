"""Storage backend Protocol and factory.

Storage backends are responsible for the *transport* of backup archives between
the worker's temp dir and a destination (local FS, S3-compatible bucket, ...).
Encryption and archive packaging happen before upload; restore downloads into
a temp dir and decrypts/extracts there.

Used-bytes accounting deliberately lives in `shared.destination_stats`, not on
this interface — both the API and the worker derive used_bytes from BackupJob
rows so storage-type-specific bucket walks are not required.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from shared.crypto import decrypt_field
from shared.enums import StorageType
from shared.models import Destination


_APP_SECRET = os.environ.get("JWT_SECRET", "")


class StorageBackendError(RuntimeError):
    """Raised on user-actionable storage failures (bucket missing, auth wrong, etc.)."""


class StorageBackend(Protocol):
    """Minimal interface for destination storage."""

    def upload(self, local_path: Path, remote_key: str) -> int:
        """Upload local_path under remote_key. Returns bytes written."""
        ...

    def download(self, remote_key: str, local_path: Path) -> None:
        """Download remote_key to local_path. Raises StorageBackendError if missing."""
        ...

    def delete(self, remote_key: str) -> None:
        """Delete remote_key. No-op if not present."""
        ...

    def validate_config(self) -> None:
        """Connectivity / permission probe. Raises StorageBackendError on failure."""
        ...


def get_storage_backend(destination: Destination) -> StorageBackend:
    """Build the right backend for a destination, decrypting secrets as needed."""
    if destination.storage_type == StorageType.LOCAL:
        from .local import LocalStorageBackend

        return LocalStorageBackend(Path(destination.path))

    if destination.storage_type == StorageType.S3:
        from .s3 import S3StorageBackend

        cfg = destination.config_data or {}
        secret = cfg.get("secret_access_key", "")
        if _APP_SECRET and secret:
            secret = decrypt_field(secret, _APP_SECRET)
        return S3StorageBackend(
            bucket=cfg["bucket"],
            prefix=cfg.get("prefix") or "",
            region=cfg.get("region") or None,
            endpoint_url=cfg.get("endpoint_url") or None,
            access_key_id=cfg["access_key_id"],
            secret_access_key=secret,
        )

    raise ValueError(f"Unknown storage type: {destination.storage_type}")
