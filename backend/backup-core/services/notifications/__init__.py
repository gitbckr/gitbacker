from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from shared.models import NotificationChannel

from shared.enums import NotificationChannelType

logger = logging.getLogger(__name__)


@dataclass
class NotificationEvent:
    """Payload passed to notification providers."""

    event_type: str  # "backup_failed", "restore_failed", etc.
    title: str  # Human-readable title
    repo_name: str
    repo_url: str
    message: str  # Error details or disk space info
    timestamp: datetime


class NotificationProvider(Protocol):
    """Minimal interface for notification backends."""

    def send(self, event: NotificationEvent) -> None:
        """Send a notification. Raises on failure."""
        ...

    def validate_config(self) -> None:
        """Check that the backend is properly configured. Raises RuntimeError if not."""
        ...


def get_notification_provider(channel: NotificationChannel) -> NotificationProvider:
    """Factory: return the right provider for the given channel type."""
    if channel.channel_type == NotificationChannelType.SLACK:
        from .slack import SlackNotificationProvider

        return SlackNotificationProvider(channel.config_data)

    raise ValueError(f"Unknown notification channel type: {channel.channel_type}")
