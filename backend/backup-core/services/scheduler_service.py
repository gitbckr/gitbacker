import logging
from datetime import datetime, timezone

from celery import current_app
from croniter import croniter
from sqlalchemy.orm import Session

from repositories import backup_job_repo, repository_repo
from shared.enums import JobStatus, TriggerType
from shared.models import BackupJob, Repository
from shared.task_signatures import TASK_RUN_BACKUP

logger = logging.getLogger(__name__)


def get_due_repos(
    session: Session, now: datetime
) -> list[tuple[Repository, datetime]]:
    """Find repos whose next cron-computed run time is at or before `now`."""
    candidates = repository_repo.get_schedulable_without_active_jobs(session)

    due: list[tuple[Repository, datetime]] = []
    for repo in candidates:
        last_finished = backup_job_repo.get_last_finished_at(session, repo.id)
        reference_time = last_finished or repo.created_at

        # Ensure timezone-aware (SQLite may return naive datetimes)
        if reference_time.tzinfo is None:
            reference_time = reference_time.replace(tzinfo=timezone.utc)

        try:
            cron = croniter(repo.cron_expression, reference_time)
            next_run = cron.get_next(datetime)
        except (ValueError, KeyError):
            logger.warning(
                "Invalid cron expression %r for repo %s, skipping",
                repo.cron_expression,
                repo.id,
            )
            continue

        if next_run <= now:
            due.append((repo, next_run))

    return due


def dispatch_scheduled_backups(session: Session) -> list[str]:
    """Find due repos, create jobs, dispatch tasks. Returns created job IDs."""
    now = datetime.now(timezone.utc)
    due_repos = get_due_repos(session, now)

    if not due_repos:
        return []

    created_job_ids: list[str] = []
    for repo, next_run in due_repos:
        job = BackupJob(
            repository_id=repo.id,
            status=JobStatus.PENDING,
            trigger_type=TriggerType.SCHEDULED,
        )
        session.add(job)
        session.flush()

        job_id_str = str(job.id)
        created_job_ids.append(job_id_str)

        logger.debug(
            "Dispatching backup for %s (due at %s)",
            repo.name,
            next_run.isoformat(),
        )

    session.commit()

    logger.info("Scheduled %d backup(s)", len(due_repos))

    for job_id_str in created_job_ids:
        try:
            current_app.send_task(TASK_RUN_BACKUP, args=[job_id_str])
        except OSError:
            logger.error(
                "Failed to dispatch task for job %s (Redis down?)", job_id_str
            )

    return created_job_ids
