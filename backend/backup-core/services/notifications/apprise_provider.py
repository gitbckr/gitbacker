import logging

import apprise

from shared.notifications import (
    ChannelConfigError,
    capture_apprise_logs,
    channel_to_apprise_url,
    format_apprise_failure,
    validate_channel_config,
)

from . import NotificationEvent

logger = logging.getLogger(__name__)

_EMOJI = {
    "backup_failed": "\U0001F534",  # red circle
    "restore_failed": "\U0001F534",
    "repo_verification_failed": "\u26A0\uFE0F",  # warning sign
    "disk_space_low": "\U0001F4BE",  # floppy disk
    "test": "\u2705",  # white check mark
}


def _format_body(event: NotificationEvent) -> str:
    details = event.message[:1500] if event.message else "_No details_"
    return (
        f"**Repository:** {event.repo_name}\n"
        f"**URL:** {event.repo_url}\n\n"
        f"```\n{details}\n```\n\n"
        f"_Gitbacker \u00B7 {event.timestamp.strftime('%Y-%m-%d %H:%M UTC')}_"
    )


class AppriseNotificationProvider:
    """Generic provider: routes any supported channel_type through Apprise."""

    def __init__(self, channel) -> None:
        self._channel_type = channel.channel_type
        self._config = channel.config_data
        self._channel_name = channel.name

    def validate_config(self) -> None:
        try:
            validate_channel_config(self._channel_type, self._config)
        except ChannelConfigError as e:
            raise RuntimeError(str(e)) from e

    def send(self, event: NotificationEvent) -> None:
        self.validate_config()
        url = channel_to_apprise_url(self._channel_type, self._config)
        a = apprise.Apprise()
        if not a.add(url):
            raise RuntimeError(
                f"Apprise rejected URL for channel '{self._channel_name}'"
            )
        emoji = _EMOJI.get(event.event_type, "\U0001F514")  # bell
        title = f"{emoji} {event.title}"
        body = _format_body(event)
        with capture_apprise_logs() as records:
            ok = a.notify(
                title=title, body=body, body_format=apprise.NotifyFormat.MARKDOWN
            )
        if not ok:
            raise RuntimeError(
                f"Channel '{self._channel_name}': {format_apprise_failure(records)}"
            )
        logger.debug("Apprise notification sent: %s", event.title)
