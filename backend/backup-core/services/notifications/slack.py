import ipaddress
import json
import logging
import socket
import urllib.request
import urllib.error
from urllib.parse import urlparse

from .import NotificationEvent

logger = logging.getLogger(__name__)

# Emoji per event type
_EMOJI = {
    "backup_failed": ":red_circle:",
    "restore_failed": ":red_circle:",
    "repo_verification_failed": ":warning:",
    "disk_space_low": ":floppy_disk:",
    "test": ":white_check_mark:",
}


class SlackNotificationProvider:
    """Sends notifications to a Slack channel via incoming webhook."""

    def __init__(self, config: dict) -> None:
        self._webhook_url: str = config.get("webhook_url", "")

    def validate_config(self) -> None:
        if not self._webhook_url:
            raise RuntimeError("webhook_url is required in config_data")
        if not self._webhook_url.startswith("https://"):
            raise RuntimeError("webhook_url must start with https://")
        # SSRF protection: reject internal/private IPs
        parsed = urlparse(self._webhook_url)
        hostname = parsed.hostname or ""
        try:
            addr = ipaddress.ip_address(socket.gethostbyname(hostname))
            if addr.is_private or addr.is_loopback or addr.is_link_local:
                raise RuntimeError(
                    f"webhook_url must not point to a private/internal address ({hostname})"
                )
        except socket.gaierror:
            raise RuntimeError(f"Cannot resolve webhook hostname: {hostname}")

    def send(self, event: NotificationEvent) -> None:
        self.validate_config()
        emoji = _EMOJI.get(event.event_type, ":bell:")
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{emoji} *{event.title}*",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Repository:*\n{event.repo_name}"},
                    {"type": "mrkdwn", "text": f"*URL:*\n{event.repo_url}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"```{event.message[:1500]}```" if event.message else "_No details_",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Gitbacker | {event.timestamp.strftime('%Y-%m-%d %H:%M UTC')}",
                    }
                ],
            },
        ]

        payload = json.dumps({"blocks": blocks}).encode()
        req = urllib.request.Request(
            self._webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status != 200:
                    body = resp.read().decode(errors="replace")
                    raise RuntimeError(
                        f"Slack webhook returned {resp.status}: {body}"
                    )
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace") if e.fp else ""
            raise RuntimeError(f"Slack webhook failed ({e.code}): {body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Could not reach Slack: {e.reason}") from e

        logger.debug("Slack notification sent: %s", event.title)
