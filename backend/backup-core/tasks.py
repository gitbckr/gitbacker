from db import SessionLocal
from services import backup_service, scheduler_service
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
