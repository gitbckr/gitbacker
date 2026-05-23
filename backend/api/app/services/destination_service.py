import asyncio
import os
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import destination_repo
from shared.crypto import encrypt_field
from shared.enums import StorageType
from shared.models import Destination, User
from shared.schemas import DestinationCreate, DestinationRead, DestinationUpdate
from shared.storage import (
    SECRET_KEYS,
    StorageConfigError,
    validate_destination_config,
)
from shared.storage_backends import StorageBackendError, get_storage_backend


_APP_SECRET = os.environ.get("JWT_SECRET", "")


async def _get_available_bytes(
    destination: Destination, used_bytes: int
) -> int | None:
    """Available capacity for a destination.

    If a quota is set, returns `quota - used` regardless of storage type
    (clamped to >=0). Otherwise falls back to filesystem free space for LOCAL
    and `None` for remote storage where there is no portable signal.
    """
    quota = destination.quota_bytes
    if destination.storage_type == StorageType.LOCAL:
        path = Path(destination.path)
        try:
            def _check() -> int:
                check_path = path
                while not check_path.exists() and check_path.parent != check_path:
                    check_path = check_path.parent
                return shutil.disk_usage(check_path).free
            disk_free = await asyncio.to_thread(_check)
        except OSError:
            disk_free = None
        if quota:
            quota_remaining = max(0, quota - used_bytes)
            return (
                min(disk_free, quota_remaining)
                if disk_free is not None
                else quota_remaining
            )
        return disk_free

    # S3, GCS, etc. — no portable free-space API.
    if quota:
        return max(0, quota - used_bytes)
    return None


async def _enrich_destinations(
    db: AsyncSession, destinations: list[Destination]
) -> list[DestinationRead]:
    if not destinations:
        return []

    dest_ids = [d.id for d in destinations]
    stats = await destination_repo.get_stats(db, dest_ids)

    result: list[DestinationRead] = []
    for dest in destinations:
        read = DestinationRead.model_validate(dest)
        dest_stats = stats.get(dest.id, {})
        read.repo_count = dest_stats.get("repo_count", 0)
        read.used_bytes = dest_stats.get("used_bytes", 0)
        read.available_bytes = await _get_available_bytes(dest, read.used_bytes)
        result.append(read)
    return result


BACKUP_ROOT = Path(os.environ.get("BACKUP_DIR", "/data/backups"))


def _encrypt_config_secrets(config: dict | None) -> dict | None:
    """Encrypt sensitive keys in a config dict before storing in DB."""
    if not config:
        return config
    out = dict(config)
    for key in SECRET_KEYS:
        if key in out and out[key] and _APP_SECRET:
            out[key] = encrypt_field(out[key], _APP_SECRET)
    return out


async def create_destination(
    db: AsyncSession, user: User, body: DestinationCreate
) -> DestinationRead:
    if body.storage_type == StorageType.LOCAL:
        path = Path(body.path).resolve()
        if not path.is_relative_to(BACKUP_ROOT.resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Local path must be under {BACKUP_ROOT}",
            )
        # Auto-create the subdirectory
        path.mkdir(parents=True, exist_ok=True)

    if body.is_default:
        await destination_repo.clear_default(db)

    destination = Destination(
        alias=body.alias,
        storage_type=body.storage_type,
        path=body.path or "",
        config_data=_encrypt_config_secrets(body.config_data),
        quota_bytes=body.quota_bytes,
        is_default=body.is_default,
        created_by=user.id,
    )
    await destination_repo.create(db, destination)
    await db.commit()
    await db.refresh(destination)
    enriched = await _enrich_destinations(db, [destination])
    return enriched[0]


async def list_destinations(db: AsyncSession) -> list[DestinationRead]:
    destinations = await destination_repo.list_all(db)
    return await _enrich_destinations(db, destinations)


async def get_destination(db: AsyncSession, dest_id: str) -> DestinationRead:
    destination = await destination_repo.get_by_id(db, uuid.UUID(dest_id))
    if not destination:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    enriched = await _enrich_destinations(db, [destination])
    return enriched[0]


async def update_destination(
    db: AsyncSession, dest_id: str, body: DestinationUpdate
) -> DestinationRead:
    destination = await destination_repo.get_by_id(db, uuid.UUID(dest_id))
    if not destination:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")

    update_data = body.model_dump(exclude_unset=True)

    if destination.storage_type == StorageType.LOCAL and "path" in update_data:
        path = Path(update_data["path"]).resolve()
        if not path.is_relative_to(BACKUP_ROOT.resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Local path must be under {BACKUP_ROOT}",
            )
        path.mkdir(parents=True, exist_ok=True)

    if "config_data" in update_data:
        # Merge partial config with the stored config so callers can omit
        # fields they don't want to change — notably secrets, which the read
        # schema strips and the UI therefore won't echo back on edit.
        existing = dict(destination.config_data or {})
        incoming = dict(update_data["config_data"] or {})
        merged = {**existing, **{k: v for k, v in incoming.items() if v not in ("", None)}}

        # Re-encrypt only secrets the user explicitly provided this round.
        for key in SECRET_KEYS:
            if key in incoming and incoming[key] and _APP_SECRET:
                merged[key] = encrypt_field(incoming[key], _APP_SECRET)

        # Validate the merged shape. Since stored secrets are ciphertext,
        # substitute placeholders so the "non-empty" checks still pass without
        # the validator needing to know about encryption.
        validate_input = dict(merged)
        for key in SECRET_KEYS:
            if validate_input.get(key):
                validate_input[key] = "<encrypted>"
        try:
            validate_destination_config(
                destination.storage_type,
                validate_input,
                update_data.get("path", destination.path),
            )
        except StorageConfigError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
            ) from e

        update_data["config_data"] = merged

    if update_data.get("is_default"):
        await destination_repo.clear_default(db)

    await destination_repo.update(db, destination, update_data)
    await db.commit()
    await db.refresh(destination)
    enriched = await _enrich_destinations(db, [destination])
    return enriched[0]


async def delete_destination(db: AsyncSession, dest_id: str) -> None:
    destination = await destination_repo.get_by_id(db, uuid.UUID(dest_id))
    if not destination:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")

    if destination.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default destination",
        )

    await destination_repo.delete(db, destination)
    await db.commit()


async def test_destination(db: AsyncSession, dest_id: str) -> dict:
    """Probe a destination's connectivity / permissions. Returns {ok, message}."""
    destination = await destination_repo.get_by_id(db, uuid.UUID(dest_id))
    if not destination:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")

    def _probe() -> tuple[bool, str]:
        try:
            backend = get_storage_backend(destination)
            backend.validate_config()
            return True, "Destination is reachable"
        except StorageBackendError as e:
            return False, str(e)
        except Exception as e:
            return False, f"Unexpected error: {e}"

    ok, message = await asyncio.to_thread(_probe)
    return {"ok": ok, "message": message}
