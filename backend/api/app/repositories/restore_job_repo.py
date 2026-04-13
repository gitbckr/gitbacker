import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import RestoreJob


async def get_by_id(db: AsyncSession, job_id: uuid.UUID) -> RestoreJob | None:
    result = await db.execute(select(RestoreJob).where(RestoreJob.id == job_id))
    return result.scalar_one_or_none()


async def list_by_repo(db: AsyncSession, repo_id: uuid.UUID) -> list[RestoreJob]:
    result = await db.execute(
        select(RestoreJob)
        .where(RestoreJob.repository_id == repo_id)
        .order_by(RestoreJob.created_at.desc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, job: RestoreJob) -> RestoreJob:
    db.add(job)
    await db.flush()
    return job
