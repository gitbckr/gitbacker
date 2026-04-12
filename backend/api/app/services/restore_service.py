import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery
from app.repositories import restore_job_repo, snapshot_repo
from app.services.repository_service import check_repo_access, get_repo_or_404
from shared.enums import JobStatus
from shared.models import BackupSnapshot, RestoreJob, User
from shared.schemas import RestoreJobCreate
from shared.task_signatures import TASK_RUN_RESTORE


async def list_snapshots(
    db: AsyncSession, user: User, repo_id: str
) -> list[BackupSnapshot]:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    return await snapshot_repo.list_by_repo(db, repo.id)


async def trigger_restore(
    db: AsyncSession, user: User, repo_id: str, body: RestoreJobCreate
) -> RestoreJob:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    snapshot = await snapshot_repo.get_by_id(db, body.snapshot_id)
    if not snapshot or snapshot.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found for this repository",
        )

    job = RestoreJob(
        repository_id=repo.id,
        snapshot_id=snapshot.id,
        triggered_by=user.id,
        restore_target_url=body.restore_target_url,
        status=JobStatus.PENDING,
    )
    await restore_job_repo.create(db, job)
    await db.commit()
    await db.refresh(job)

    try:
        celery.send_task(TASK_RUN_RESTORE, args=[str(job.id)])
    except OSError:
        # Redis connection failure — job stays in "pending"
        pass
    return job


async def get_restore_job(
    db: AsyncSession, user: User, repo_id: str, job_id: str
) -> RestoreJob:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    job = await restore_job_repo.get_by_id(db, uuid.UUID(job_id))
    if not job or job.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restore job not found",
        )
    return job
