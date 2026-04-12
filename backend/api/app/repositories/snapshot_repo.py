import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import BackupSnapshot


async def get_by_id(db: AsyncSession, snapshot_id: uuid.UUID) -> BackupSnapshot | None:
    result = await db.execute(
        select(BackupSnapshot).where(BackupSnapshot.id == snapshot_id)
    )
    return result.scalar_one_or_none()


async def list_by_repo(
    db: AsyncSession, repo_id: uuid.UUID, limit: int = 50
) -> list[BackupSnapshot]:
    result = await db.execute(
        select(BackupSnapshot)
        .where(BackupSnapshot.repository_id == repo_id)
        .order_by(BackupSnapshot.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
