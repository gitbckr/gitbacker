"""Destination-type-aware config validation.

Pure-Python validation; does not import boto3. Both the API service (POST/PATCH
validation + test endpoint) and backup-core (boot-time backend construction)
consume these helpers so the per-type config shapes have one source of truth.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import urlparse

from .enums import StorageType


class StorageConfigError(ValueError):
    """Raised when a destination's config_data is malformed for its storage_type."""


_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$")
_BUCKET_IP_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")


def _validate_bucket_name(name: str) -> None:
    if not name:
        raise StorageConfigError("bucket is required")
    if not _BUCKET_RE.match(name):
        raise StorageConfigError(
            "bucket must be 3-63 chars, lowercase letters/digits/dots/hyphens, "
            "starting and ending with a letter or digit"
        )
    if ".." in name or ".-" in name or "-." in name:
        raise StorageConfigError("bucket must not contain adjacent dots/hyphens")
    if _BUCKET_IP_RE.match(name):
        raise StorageConfigError("bucket must not be formatted as an IP address")


def _validate_prefix(prefix: str) -> None:
    if prefix.startswith("/"):
        raise StorageConfigError("prefix must not start with '/'")
    if ".." in prefix.split("/"):
        raise StorageConfigError("prefix must not contain '..' segments")


def _check_not_private(url: str, *, field: str) -> None:
    """SSRF guard: reject URLs that resolve to private/loopback/link-local IPs."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if not hostname:
        raise StorageConfigError(f"{field} has no hostname")
    try:
        addr = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror as e:
        raise StorageConfigError(f"Cannot resolve hostname: {hostname}") from e
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        raise StorageConfigError(
            f"{field} must not point to a private/internal address ({hostname}). "
            "For MinIO on localhost, set allow_private_endpoint=true."
        )


def validate_destination_config(
    storage_type: StorageType,
    config: dict | None,
    path: str | None,
) -> None:
    """Validate config_data + path against the schema for storage_type.

    Raises StorageConfigError on failure. Successful return implies the
    inputs are well-formed enough for the storage backend constructor.
    """
    match storage_type:
        case StorageType.LOCAL:
            if not path:
                raise StorageConfigError("path is required for LOCAL destinations")
            if config:
                raise StorageConfigError(
                    "config_data must be empty for LOCAL destinations"
                )

        case StorageType.S3:
            if not isinstance(config, dict) or not config:
                raise StorageConfigError("config_data is required for S3 destinations")

            _validate_bucket_name(str(config.get("bucket", "")))

            prefix = config.get("prefix") or ""
            if prefix:
                _validate_prefix(str(prefix))

            endpoint_url = config.get("endpoint_url") or ""
            if endpoint_url:
                if not endpoint_url.startswith(("http://", "https://")):
                    raise StorageConfigError(
                        "endpoint_url must start with http:// or https://"
                    )
                if not config.get("allow_private_endpoint"):
                    _check_not_private(endpoint_url, field="endpoint_url")

            if not config.get("access_key_id"):
                raise StorageConfigError("access_key_id is required for S3")
            if not config.get("secret_access_key"):
                raise StorageConfigError("secret_access_key is required for S3")

        case _:
            raise StorageConfigError(f"Unsupported storage type: {storage_type}")


SECRET_KEYS: tuple[str, ...] = ("secret_access_key",)
"""Config keys whose values are encrypted at rest and must never appear in read schemas."""
