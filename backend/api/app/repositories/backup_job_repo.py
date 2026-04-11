import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, cast, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from shared.enums import JobStatus
from shared.models import BackupJob


async def get_latest_successful_by_repo_ids(
    db: AsyncSession, repo_ids: list[uuid.UUID]
) -> dict[uuid.UUID, datetime]:
    if not repo_ids:
        return {}
    subq = (
        select(
            BackupJob.repository_id,
            func.max(BackupJob.finished_at).label("last_finished"),
        )
        .where(
            BackupJob.repository_id.in_(repo_ids),
            BackupJob.status == JobStatus.SUCCEEDED,
            BackupJob.finished_at.is_not(None),
        )
        .group_by(BackupJob.repository_id)
    )
    result = await db.execute(subq)
    return {row[0]: row[1] for row in result.all()}


async def list_by_repo(db: AsyncSession, repo_id: uuid.UUID) -> list[BackupJob]:
    result = await db.execute(
        select(BackupJob)
        .where(BackupJob.repository_id == repo_id)
        .order_by(BackupJob.created_at.desc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, job: BackupJob) -> BackupJob:
    db.add(job)
    await db.flush()
    return job


async def get_daily_activity(
    db: AsyncSession,
    days: int = 365,
    repo_ids: list[uuid.UUID] | None = None,
) -> list[tuple[str, int, int, int]]:
    """Return (date_str, succeeded, failed, total) per day."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    day_col = cast(BackupJob.finished_at, Date).label("day")

    succeeded_count = func.count(
        case((BackupJob.status == JobStatus.SUCCEEDED, 1))
    )
    failed_count = func.count(
        case((BackupJob.status == JobStatus.FAILED, 1))
    )

    stmt = (
        select(day_col, succeeded_count, failed_count, func.count())
        .where(
            BackupJob.finished_at >= cutoff,
            BackupJob.status.in_([JobStatus.SUCCEEDED, JobStatus.FAILED]),
        )
        .group_by(day_col)
        .order_by(day_col)
    )

    if repo_ids is not None:
        stmt = stmt.where(BackupJob.repository_id.in_(repo_ids))

    result = await db.execute(stmt)
    return [
        (row[0].isoformat(), row[1], row[2], row[3])
        for row in result.all()
    ]
