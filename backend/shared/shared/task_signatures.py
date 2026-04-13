"""Celery task name constants shared between api and backup-core."""

TASK_RUN_BACKUP = "backup_core.tasks.run_backup"
TASK_VERIFY_REPO = "backup_core.tasks.verify_repo"
TASK_SCAN_DUE_REPOS = "backup_core.tasks.scan_due_repos"
TASK_RUN_RESTORE = "backup_core.tasks.run_restore"
TASK_RUN_RESTORE_PREVIEW = "backup_core.tasks.run_restore_preview"
TASK_RUN_DETAILED_PREVIEW = "backup_core.tasks.run_detailed_preview"
