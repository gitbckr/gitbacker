"""Shared helpers used by both backup and restore services."""

import logging

from sqlalchemy.orm import Session

from repositories import git_credential_repo, notification_channel_repo
from services.git_service import extract_host
from services.notifications import NotificationEvent, get_notification_provider
from shared.enums import CredentialType
from shared.models import GitCredential

logger = logging.getLogger(__name__)


def resolve_credential(
    session: Session, url: str
) -> tuple[GitCredential | None, str | None]:
    """Find a matching git credential for the URL, respecting scheme/type compatibility.

    Returns (credential, mismatch_warning). If a credential exists for the host
    but doesn't match the URL scheme, returns (None, warning_message).
    """
    host = extract_host(url)
    if not host:
        return None, None
    cred = git_credential_repo.get_by_host(session, host)
    if not cred:
        return None, None
    is_https = url.startswith(("https://", "http://"))
    if cred.credential_type == CredentialType.PAT and not is_https:
        return None, (
            f"A PAT credential exists for {host} but the repo URL uses SSH. "
            "PATs only work with HTTPS URLs."
        )
    if cred.credential_type == CredentialType.SSH_KEY and is_https:
        return None, (
            f"An SSH key credential exists for {host} but the repo URL uses HTTPS. "
            f"Either switch the repo URL to SSH (git@{host}:...) or add a PAT credential."
        )
    return cred, None


def send_notifications(session: Session, event: NotificationEvent) -> None:
    """Best-effort: send to all matching channels, log failures."""
    channels = notification_channel_repo.get_enabled_for_event(
        session, event.event_type
    )
    for channel in channels:
        try:
            provider = get_notification_provider(channel)
            provider.send(event)
        except Exception as e:
            logger.error("Notification to '%s' failed: %s", channel.name, e)
