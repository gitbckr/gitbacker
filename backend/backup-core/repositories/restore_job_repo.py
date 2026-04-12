import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from shared.enums import JobStatus
from shared.models import RestoreJob


def get_by_id(session: Session, job_id: uuid.UUID) -> RestoreJob | None:
    return session.get(RestoreJob, job_id)


def mark_running(session: Session, job: RestoreJob, started_at: datetime) -> None:
    job.status = JobStatus.RUNNING
    job.started_at = started_at


def mark_succeeded(
    session: Session,
    job: RestoreJob,
    finished_at: datetime,
    duration_seconds: int,
    output_log: str,
) -> None:
    job.status = JobStatus.SUCCEEDED
    job.finished_at = finished_at
    job.duration_seconds = duration_seconds
    job.output_log = output_log


def mark_failed(
    session: Session,
    job: RestoreJob,
    finished_at: datetime,
    duration_seconds: int | None,
    output_log: str,
) -> None:
    job.status = JobStatus.FAILED
    job.finished_at = finished_at
    job.duration_seconds = duration_seconds
    job.output_log = output_log
