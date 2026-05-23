"""Local-filesystem storage backend.

Wraps the inline shutil.move logic that used to live in backup_service.run_backup,
plus a defensive traversal guard inherited from the previous restore_service
inline `is_relative_to` check.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from . import StorageBackend, StorageBackendError


class LocalStorageBackend:
    """Atomic-rename-based storage on a local directory."""

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        if not self._root.is_absolute():
            raise StorageBackendError(f"Destination path must be absolute: {root}")

    def _resolve_key(self, remote_key: str) -> Path:
        if remote_key.startswith("/") or ".." in remote_key.split("/"):
            raise StorageBackendError(f"Invalid storage key: {remote_key!r}")
        return self._root / remote_key

    def upload(self, local_path: Path, remote_key: str) -> int:
        target = self._resolve_key(remote_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(local_path), str(target))
        return target.stat().st_size

    def download(self, remote_key: str, local_path: Path) -> None:
        source = self._resolve_key(remote_key)
        if not source.is_file():
            raise StorageBackendError(f"Archive not found at destination: {remote_key}")
        local_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(str(source), str(local_path))

    def delete(self, remote_key: str) -> None:
        target = self._resolve_key(remote_key)
        target.unlink(missing_ok=True)

    def validate_config(self) -> None:
        if not self._root.exists():
            try:
                self._root.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise StorageBackendError(f"Cannot create destination dir: {e}") from e
        if not self._root.is_dir():
            raise StorageBackendError(f"Destination path is not a directory: {self._root}")
        # Probe writability.
        probe = self._root / ".gitbacker_write_probe"
        try:
            probe.write_text("ok")
            probe.unlink()
        except OSError as e:
            raise StorageBackendError(f"Destination not writable: {e}") from e
