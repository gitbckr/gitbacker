import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.enums import JobStatus, RepoStatus
from shared.models import BackupJob, Repository

SCHEDULABLE_STATUSES = (RepoStatus.SCHEDULED, RepoStatus.BACKED_UP, RepoStatus.FAILED)


def get_by_id(session: Session, repo_id: uuid.UUID) -> Repository | None:
    return session.get(Repository, repo_id)


def get_by_id_for_update(session: Session, repo_id: uuid.UUID) -> Repository | None:
    """Get repo with a row-level lock to prevent concurrent backups."""
    result = session.execute(
        select(Repository).where(Repository.id == repo_id).with_for_update()
    )
    return result.scalar_one_or_none()


def update_status(
    session: Session, repo: Repository, status: RepoStatus, reason: str | None = None
) -> None:
    repo.status = status
    repo.status_reason = reason


def get_schedulable_without_active_jobs(session: Session) -> list[Repository]:
    """Get repos with a cron expression, eligible status, and no PENDING/RUNNING jobs."""
    stmt = (
        select(Repository)
        .where(
            Repository.cron_expression.is_not(None),
            Repository.status.in_(SCHEDULABLE_STATUSES),
            ~(
                select(BackupJob.id)
                .where(
                    BackupJob.repository_id == Repository.id,
                    BackupJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
                )
                .exists()
            ),
        )
    )
    result = session.execute(stmt)
    return list(result.scalars().all())
