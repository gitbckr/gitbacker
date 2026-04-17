import asyncio
import os
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import destination_repo
from shared.enums import StorageType
from shared.models import Destination, User
from shared.schemas import DestinationCreate, DestinationRead, DestinationUpdate


async def _get_available_bytes(destination: Destination) -> int | None:
    """Get available disk space for a destination. Returns None if unknown."""
    if destination.storage_type == StorageType.LOCAL:
        path = Path(destination.path)
        try:
            def _check() -> int:
                check_path = path
                while not check_path.exists() and check_path.parent != check_path:
                    check_path = check_path.parent
                return shutil.disk_usage(check_path).free
            return await asyncio.to_thread(_check)
        except OSError:
            return None
    # S3, GCS, etc. — no simple way to know
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
        read.available_bytes = await _get_available_bytes(dest)
        result.append(read)
    return result


BACKUP_ROOT = Path(os.environ.get("BACKUP_DIR", "/data/backups"))


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
        path=body.path,
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
