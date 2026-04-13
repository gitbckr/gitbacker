from datetime import datetime, timedelta, timezone

from db import SessionLocal
from repositories import restore_preview_repo
from services import backup_service, restore_service, scheduler_service
from worker import app


@app.task(name="backup_core.tasks.verify_repo")
def verify_repo(repo_id: str) -> dict:
    with SessionLocal() as session:
        return backup_service.verify_repo(session, repo_id)


@app.task(name="backup_core.tasks.run_backup")
def run_backup(job_id: str) -> dict:
    with SessionLocal() as session:
        return backup_service.run_backup(session, job_id)


@app.task(name="backup_core.tasks.scan_due_repos")
def scan_due_repos() -> dict:
    """Periodic task: scan for repos due for scheduled backup and dispatch jobs."""
    with SessionLocal() as session:
        job_ids = scheduler_service.dispatch_scheduled_backups(session)
    return {"dispatched": len(job_ids), "job_ids": job_ids}


@app.task(name="backup_core.tasks.run_restore")
def run_restore(restore_job_id: str) -> dict:
    with SessionLocal() as session:
        return restore_service.run_restore(session, restore_job_id)


@app.task(name="backup_core.tasks.run_restore_preview")
def run_restore_preview(preview_id: str) -> dict:
    with SessionLocal() as session:
        return restore_service.run_restore_preview(session, preview_id)


@app.task(name="backup_core.tasks.run_detailed_preview")
def run_detailed_preview(preview_id: str) -> dict:
    with SessionLocal() as session:
        return restore_service.run_detailed_preview(session, preview_id)


@app.task(name="backup_core.tasks.cleanup_old_previews")
def cleanup_old_previews() -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    with SessionLocal() as session:
        count = restore_preview_repo.delete_older_than(session, cutoff)
        session.commit()
    return {"deleted": count}
