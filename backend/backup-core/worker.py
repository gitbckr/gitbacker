import os

from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6666/0")

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
    },
})
