import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.enums import JobStatus
from shared.models import BackupJob, Destination, Repository


async def get_by_id(db: AsyncSession, dest_id: uuid.UUID) -> Destination | None:
    result = await db.execute(select(Destination).where(Destination.id == dest_id))
    return result.scalar_one_or_none()


async def get_default(db: AsyncSession) -> Destination | None:
    result = await db.execute(select(Destination).where(Destination.is_default.is_(True)))
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[Destination]:
    result = await db.execute(select(Destination).order_by(Destination.created_at))
    return list(result.scalars().all())


async def create(db: AsyncSession, destination: Destination) -> Destination:
    db.add(destination)
    await db.flush()
    return destination


async def clear_default(db: AsyncSession) -> None:
    result = await db.execute(select(Destination).where(Destination.is_default.is_(True)))
    for dest in result.scalars().all():
        dest.is_default = False


async def update(db: AsyncSession, destination: Destination, fields: dict) -> Destination:
    for field, value in fields.items():
        setattr(destination, field, value)
    await db.flush()
    return destination


async def delete(db: AsyncSession, destination: Destination) -> None:
    await db.delete(destination)


async def get_stats(
    db: AsyncSession, dest_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict]:
    """Return repo_count and used_bytes per destination."""
    # Repo count per destination
    repo_count_result = await db.execute(
        select(Repository.destination_id, func.count(Repository.id))
        .where(Repository.destination_id.in_(dest_ids))
        .group_by(Repository.destination_id)
    )
    repo_counts: dict[uuid.UUID, int] = {
        row[0]: row[1] for row in repo_count_result.all()
    }

    # Total backup size per destination (from successful jobs)
    size_result = await db.execute(
        select(Repository.destination_id, func.coalesce(func.sum(BackupJob.backup_size_bytes), 0))
        .join(BackupJob, BackupJob.repository_id == Repository.id)
        .where(
            Repository.destination_id.in_(dest_ids),
            BackupJob.status == JobStatus.SUCCEEDED,
        )
        .group_by(Repository.destination_id)
    )
    used_bytes: dict[uuid.UUID, int] = {
        row[0]: row[1] for row in size_result.all()
    }

    stats: dict[uuid.UUID, dict] = {}
    for dest_id in dest_ids:
        stats[dest_id] = {
            "repo_count": repo_counts.get(dest_id, 0),
            "used_bytes": used_bytes.get(dest_id, 0),
        }
    return stats
