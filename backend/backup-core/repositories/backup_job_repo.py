import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.enums import JobStatus
from shared.models import BackupJob


def get_by_id(session: Session, job_id: uuid.UUID) -> BackupJob | None:
    return session.get(BackupJob, job_id)


def mark_running(session: Session, job: BackupJob, started_at: datetime) -> None:
    job.status = JobStatus.RUNNING
    job.started_at = started_at


def mark_succeeded(
    session: Session,
    job: BackupJob,
    finished_at: datetime,
    duration_seconds: int,
    output_log: str,
    backup_size_bytes: int,
) -> None:
    job.status = JobStatus.SUCCEEDED
    job.finished_at = finished_at
    job.duration_seconds = duration_seconds
    job.output_log = output_log
    job.backup_size_bytes = backup_size_bytes


def get_last_finished_at(session: Session, repo_id: uuid.UUID) -> datetime | None:
    """Get finished_at of the most recent completed job for a repo."""
    stmt = (
        select(BackupJob.finished_at)
        .where(
            BackupJob.repository_id == repo_id,
            BackupJob.finished_at.is_not(None),
        )
        .order_by(BackupJob.finished_at.desc())
        .limit(1)
    )
    result = session.execute(stmt)
    return result.scalar_one_or_none()


def mark_failed(
    session: Session,
    job: BackupJob,
    finished_at: datetime,
    duration_seconds: int | None,
    output_log: str,
) -> None:
    job.status = JobStatus.FAILED
    job.finished_at = finished_at
    job.duration_seconds = duration_seconds
    job.output_log = output_log
