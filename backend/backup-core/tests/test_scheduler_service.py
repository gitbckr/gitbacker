import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from shared.enums import JobStatus, RepoStatus, TriggerType
from shared.models import BackupJob
from services.scheduler_service import dispatch_scheduled_backups, get_due_repos


def test_repo_due_after_cron_slot(db_session, repository):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 1
    assert due[0][0].id == repository.id


def test_repo_not_due_yet(db_session, repository):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "0 0 1 1 *"  # once a year, Jan 1 midnight
    repository.created_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 0


def test_repo_with_active_job_skipped(db_session, repository, backup_job):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    backup_job.status = JobStatus.PENDING
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 0


def test_repo_without_cron_skipped(db_session, repository):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = None
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 0


def test_verifying_status_skipped(db_session, repository):
    repository.status = RepoStatus.VERIFYING
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 0


def test_failed_repo_due_at_next_slot(db_session, repository):
    repository.status = RepoStatus.FAILED
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.flush()

    failed_job = BackupJob(
        repository_id=repository.id,
        status=JobStatus.FAILED,
        trigger_type=TriggerType.SCHEDULED,
        finished_at=datetime.now(timezone.utc) - timedelta(minutes=10),
    )
    db_session.add(failed_job)
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 1


def test_invalid_cron_skipped(db_session, repository):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "not a cron"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    now = datetime.now(timezone.utc)
    due = get_due_repos(db_session, now)

    assert len(due) == 0


@patch("services.scheduler_service.current_app")
def test_dispatch_creates_jobs(mock_celery, db_session, repository):
    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    job_ids = dispatch_scheduled_backups(db_session)

    assert len(job_ids) == 1
    mock_celery.send_task.assert_called_once()

    job = db_session.get(BackupJob, uuid.UUID(job_ids[0]))
    assert job is not None
    assert job.trigger_type == TriggerType.SCHEDULED
    assert job.status == JobStatus.PENDING


@patch("services.scheduler_service.current_app")
def test_redis_failure_still_commits(mock_celery, db_session, repository):
    mock_celery.send_task.side_effect = OSError("Redis connection refused")

    repository.status = RepoStatus.SCHEDULED
    repository.cron_expression = "*/5 * * * *"
    repository.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    job_ids = dispatch_scheduled_backups(db_session)

    assert len(job_ids) == 1
    job = db_session.get(BackupJob, uuid.UUID(job_ids[0]))
    assert job is not None
    assert job.status == JobStatus.PENDING
