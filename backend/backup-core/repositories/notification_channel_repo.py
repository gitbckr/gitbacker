from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import NotificationChannel

# Map event_type strings to the corresponding boolean column on NotificationChannel.
_EVENT_COLUMN_MAP = {
    "backup_failed": NotificationChannel.on_backup_failure,
    "restore_failed": NotificationChannel.on_restore_failure,
    "repo_verification_failed": NotificationChannel.on_repo_verification_failure,
    "disk_space_low": NotificationChannel.on_disk_space_low,
}


def get_enabled_for_event(
    session: Session, event_type: str
) -> list[NotificationChannel]:
    """Return all enabled channels that are subscribed to the given event type."""
    col = _EVENT_COLUMN_MAP.get(event_type)
    if col is None:
        return []
    result = session.execute(
        select(NotificationChannel).where(
            NotificationChannel.enabled.is_(True),
            col.is_(True),
        )
    )
    return list(result.scalars().all())
