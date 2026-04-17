import logging
import os

from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Configure app-level logging (celery's own logs stay at their default).
# Set LOG_LEVEL=DEBUG to see git commands, encryption steps, etc.
_log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.INFO),
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = Celery("backup_core", broker=REDIS_URL)
app.config_from_object({
    "task_serializer": "json",
    "accept_content": ["json"],
    "result_serializer": "json",
    "timezone": "UTC",
    "enable_utc": True,
    "imports": ["tasks"],
    "beat_schedule": {
        "scan-due-repos": {
            "task": "backup_core.tasks.scan_due_repos",
            "schedule": 60.0,
        },
        "cleanup-old-previews": {
            "task": "backup_core.tasks.cleanup_old_previews",
            "schedule": 3600.0,
        },
    },
})
