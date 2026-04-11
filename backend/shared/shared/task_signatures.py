"""Celery task name constants shared between api and backup-core."""

TASK_RUN_BACKUP = "backup_core.tasks.run_backup"
TASK_VERIFY_REPO = "backup_core.tasks.verify_repo"
TASK_SCAN_DUE_REPOS = "backup_core.tasks.scan_due_repos"
