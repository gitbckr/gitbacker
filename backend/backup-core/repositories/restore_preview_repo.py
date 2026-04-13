import uuid
from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from shared.enums import JobStatus
from shared.models import RestorePreview


def get_by_id(session: Session, preview_id: uuid.UUID) -> RestorePreview | None:
    return session.get(RestorePreview, preview_id)


def mark_running(session: Session, preview: RestorePreview) -> None:
    preview.status = JobStatus.RUNNING


def mark_succeeded(
    session: Session,
    preview: RestorePreview,
    finished_at: datetime,
    result_data: dict,
) -> None:
    preview.status = JobStatus.SUCCEEDED
    preview.finished_at = finished_at
    preview.result_data = result_data


def mark_failed(
    session: Session,
    preview: RestorePreview,
    finished_at: datetime,
    error_message: str,
) -> None:
    preview.status = JobStatus.FAILED
    preview.finished_at = finished_at
    preview.error_message = error_message


def mark_detail_running(session: Session, preview: RestorePreview) -> None:
    preview.detail_status = JobStatus.RUNNING


def mark_detail_succeeded(
    session: Session,
    preview: RestorePreview,
    detail_data: dict,
) -> None:
    preview.detail_status = JobStatus.SUCCEEDED
    preview.detail_data = detail_data


def mark_detail_failed(
    session: Session,
    preview: RestorePreview,
    detail_error: str,
) -> None:
    preview.detail_status = JobStatus.FAILED
    preview.detail_error = detail_error


def delete_older_than(session: Session, cutoff: datetime) -> int:
    result = session.execute(
        delete(RestorePreview).where(RestorePreview.created_at < cutoff)
    )
    return result.rowcount
