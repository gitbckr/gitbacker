"""Channel-type-to-Apprise-URL conversion and config validation.

Pure string logic; does not import apprise. Both the API service (for
validation and test dispatch) and backup-core (for runtime dispatch)
consume these helpers so the per-type config shapes have one source of truth.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from contextlib import contextmanager
from urllib.parse import quote, urlparse

from .enums import NotificationChannelType


class ChannelConfigError(ValueError):
    """Raised when a channel's config_data is malformed for its channel_type."""


_USERINFO_RE = re.compile(r"(://[^/\s:]+):[^/\s@]+@")


def _scrub(msg: str) -> str:
    """Redact any `scheme://user:password@host` credentials that slipped into logs."""
    return _USERINFO_RE.sub(r"\1:****@", msg)


@contextmanager
def capture_apprise_logs(min_level: int = logging.DEBUG):
    """Attach a temporary handler to the 'apprise' logger and collect records.

    Usage:
        with capture_apprise_logs() as records:
            a.notify(...)
        msg = format_apprise_failure(records)

    The handler is removed on exit; the logger's prior level is restored.
    """
    buffer: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            buffer.append(record)

    handler = _Capture(level=min_level)
    apprise_logger = logging.getLogger("apprise")
    original_level = apprise_logger.level
    apprise_logger.addHandler(handler)
    if original_level == logging.NOTSET or original_level > min_level:
        apprise_logger.setLevel(min_level)
    try:
        yield buffer
    finally:
        apprise_logger.removeHandler(handler)
        apprise_logger.setLevel(original_level)


def format_apprise_failure(
    records: list[logging.LogRecord], max_chars: int = 500
) -> str:
    """Condense captured apprise records into a single user-facing failure message.

    Prefers WARNING/ERROR records; falls back to DEBUG records that look like
    protocol-level error detail (e.g. SMTP '(535, ...)', HTTP status codes).
    """
    headlines: list[str] = []
    details: list[str] = []
    for r in records:
        msg = _scrub(r.getMessage())
        if r.levelno >= logging.WARNING:
            headlines.append(msg)
        elif r.levelno == logging.DEBUG and (
            msg.startswith("Socket Exception")
            or msg.startswith("SMTP")
            or msg.startswith("HTTP")
            or "Response" in msg[:30]
        ):
            details.append(msg)

    parts = headlines + details
    if not parts:
        return "Dispatch failed (no detail emitted by Apprise)."
    combined = " | ".join(parts)
    if len(combined) > max_chars:
        combined = combined[: max_chars - 1] + "…"
    return combined


def _check_not_private(url: str, *, field: str) -> None:
    """SSRF guard: reject URLs that resolve to private/loopback/link-local IPs."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if not hostname:
        raise ChannelConfigError(f"{field} has no hostname")
    try:
        addr = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror:
        raise ChannelConfigError(f"Cannot resolve hostname: {hostname}")
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        raise ChannelConfigError(
            f"{field} must not point to a private/internal address ({hostname})"
        )


def validate_channel_config(
    channel_type: NotificationChannelType, config: dict
) -> None:
    """Validate that config_data matches the schema expected for channel_type.

    Performs shape checks and SSRF protection for any user-supplied URL.
    Raises ChannelConfigError with a user-friendly message on failure.
    """
    if not isinstance(config, dict) or not config:
        raise ChannelConfigError("config_data is required")

    match channel_type:
        case NotificationChannelType.SLACK:
            url = config.get("webhook_url", "")
            if not url:
                raise ChannelConfigError("webhook_url is required for Slack")
            if not url.startswith("https://hooks.slack.com/services/"):
                raise ChannelConfigError(
                    "webhook_url must start with https://hooks.slack.com/services/"
                )
            _check_not_private(url, field="webhook_url")

        case NotificationChannelType.DISCORD:
            url = config.get("webhook_url", "")
            if not url:
                raise ChannelConfigError("webhook_url is required for Discord")
            if "/api/webhooks/" not in url or not url.startswith("https://"):
                raise ChannelConfigError(
                    "webhook_url must be a Discord webhook URL (https://discord.com/api/webhooks/...)"
                )
            _check_not_private(url, field="webhook_url")

        case NotificationChannelType.EMAIL:
            required = ("smtp_host", "smtp_user", "smtp_password", "from_addr", "to_addrs")
            missing = [k for k in required if not config.get(k)]
            if missing:
                raise ChannelConfigError(
                    f"Missing required email fields: {', '.join(missing)}"
                )
            to_addrs = config["to_addrs"]
            if isinstance(to_addrs, str):
                to_addrs = [a.strip() for a in to_addrs.split(",") if a.strip()]
            if not to_addrs:
                raise ChannelConfigError("to_addrs must contain at least one recipient")

        case NotificationChannelType.WEBHOOK:
            url = config.get("url", "")
            if not url or not url.startswith(("http://", "https://")):
                raise ChannelConfigError("url must be an http(s) URL")
            _check_not_private(url, field="url")

        case NotificationChannelType.APPRISE_URL:
            url = config.get("url", "")
            if not url or "://" not in url:
                raise ChannelConfigError(
                    "url must be a valid Apprise URL (e.g. 'telegram://token/chat_id')"
                )

        case _:
            raise ChannelConfigError(
                f"Unsupported channel type: {channel_type}"
            )


def channel_to_apprise_url(
    channel_type: NotificationChannelType, config: dict
) -> str:
    """Translate a (channel_type, config_data) pair into a single Apprise URL.

    Assumes the config has already been validated with validate_channel_config.
    """
    match channel_type:
        case NotificationChannelType.SLACK:
            tokens = config["webhook_url"].split("/services/", 1)[1]
            return f"slack://{tokens}"

        case NotificationChannelType.DISCORD:
            parts = config["webhook_url"].rstrip("/").split("/api/webhooks/", 1)[1]
            webhook_id, webhook_token = parts.split("/", 1)
            return f"discord://{webhook_id}/{webhook_token}"

        case NotificationChannelType.EMAIL:
            scheme = "mailtos" if config.get("use_tls", True) else "mailto"
            host = config["smtp_host"]
            port = int(config.get("smtp_port", 587))
            user = quote(config["smtp_user"], safe="")
            password = quote(config["smtp_password"], safe="")
            from_addr = quote(config["from_addr"], safe="@")
            to_raw = config["to_addrs"]
            to_list = (
                [a.strip() for a in to_raw.split(",") if a.strip()]
                if isinstance(to_raw, str)
                else list(to_raw)
            )
            to_qs = ",".join(quote(a, safe="@") for a in to_list)
            return (
                f"{scheme}://{user}:{password}@{host}:{port}"
                f"?from={from_addr}&to={to_qs}"
            )

        case NotificationChannelType.WEBHOOK:
            parsed = urlparse(config["url"])
            scheme = "jsons" if parsed.scheme == "https" else "json"
            netloc = parsed.netloc
            path = parsed.path or ""
            return f"{scheme}://{netloc}{path}"

        case NotificationChannelType.APPRISE_URL:
            return config["url"]

    raise ChannelConfigError(f"Unsupported channel type: {channel_type}")
