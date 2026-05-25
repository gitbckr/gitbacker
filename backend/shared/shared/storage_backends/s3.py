"""S3-compatible storage backend (AWS S3, MinIO, R2, Wasabi, Backblaze B2)."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import (
    ClientError,
    EndpointConnectionError,
    NoCredentialsError,
)

from . import StorageBackendError

logger = logging.getLogger(__name__)


@lru_cache(maxsize=16)
def _build_client(
    region: str | None,
    endpoint_url: str | None,
    access_key_id: str,
    secret_access_key: str,
) -> Any:
    """Cache boto3 clients by connection params. Prefork-safe (each Celery worker
    process has its own cache)."""
    return boto3.client(
        "s3",
        region_name=region or "us-east-1",
        endpoint_url=endpoint_url or None,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(
            retries={"max_attempts": 3, "mode": "standard"},
            signature_version="s3v4",
        ),
    )


def _translate_client_error(
    e: ClientError, *, bucket: str, op: str = ""
) -> StorageBackendError:
    code = e.response.get("Error", {}).get("Code", "")
    msg = e.response.get("Error", {}).get("Message", str(e))
    if code == "NoSuchBucket":
        return StorageBackendError(f"Bucket '{bucket}' does not exist")
    if code in ("AccessDenied", "403"):
        return StorageBackendError(f"Access denied to bucket '{bucket}': {msg}")
    if code == "InvalidAccessKeyId":
        return StorageBackendError("Invalid AWS access key ID")
    if code == "SignatureDoesNotMatch":
        return StorageBackendError("Invalid AWS secret access key (signature mismatch)")
    if code in ("NoSuchKey", "404"):
        # 404 from download_file / head_object means the key is missing —
        # use the op hint when present to give a more specific message.
        verb = op or "Object"
        return StorageBackendError(f"{verb} not found in bucket '{bucket}'")
    return StorageBackendError(f"S3 error ({code}): {msg}")


class S3StorageBackend:
    """Stores backup archives in an S3-compatible bucket."""

    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = "",
        region: str | None = None,
        endpoint_url: str | None = None,
        access_key_id: str,
        secret_access_key: str,
    ) -> None:
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._client = _build_client(
            region, endpoint_url, access_key_id, secret_access_key
        )

    def _full_key(self, remote_key: str) -> str:
        if remote_key.startswith("/") or ".." in remote_key.split("/"):
            raise StorageBackendError(f"Invalid storage key: {remote_key!r}")
        return f"{self._prefix}/{remote_key}".lstrip("/") if self._prefix else remote_key

    def upload(self, local_path: Path, remote_key: str) -> int:
        key = self._full_key(remote_key)
        try:
            # upload_file uses the boto3 TransferManager which handles
            # multipart upload + parallel parts for large files automatically.
            self._client.upload_file(str(local_path), self._bucket, key)
        except ClientError as e:
            raise _translate_client_error(e, bucket=self._bucket) from e
        except EndpointConnectionError as e:
            raise StorageBackendError(f"Cannot reach S3 endpoint: {e}") from e
        return local_path.stat().st_size

    def download(self, remote_key: str, local_path: Path) -> None:
        key = self._full_key(remote_key)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._client.download_file(self._bucket, key, str(local_path))
        except ClientError as e:
            raise _translate_client_error(
                e, bucket=self._bucket, op=f"Archive '{remote_key}'"
            ) from e
        except EndpointConnectionError as e:
            raise StorageBackendError(f"Cannot reach S3 endpoint: {e}") from e

    def delete(self, remote_key: str) -> None:
        key = self._full_key(remote_key)
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except ClientError as e:
            raise _translate_client_error(e, bucket=self._bucket) from e

    def validate_config(self) -> None:
        # Prefer head_bucket (cheapest); fall back to list_objects_v2 when the
        # credentials lack s3:ListBucket on the bucket but can still read/write.
        # At this call site a 404 unambiguously means the bucket is missing —
        # the translator can't tell 404-missing-bucket from 404-missing-key
        # because both surface as the same HTTP code, so handle it inline.
        try:
            self._client.head_bucket(Bucket=self._bucket)
            return
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "404":
                raise StorageBackendError(
                    f"Bucket '{self._bucket}' does not exist"
                ) from e
            if code not in ("AccessDenied", "403"):
                raise _translate_client_error(e, bucket=self._bucket) from e
        except EndpointConnectionError as e:
            raise StorageBackendError(f"Cannot reach S3 endpoint: {e}") from e
        except NoCredentialsError as e:
            raise StorageBackendError("No AWS credentials provided") from e

        try:
            self._client.list_objects_v2(Bucket=self._bucket, MaxKeys=1)
        except ClientError as e:
            raise _translate_client_error(e, bucket=self._bucket) from e
        except EndpointConnectionError as e:
            raise StorageBackendError(f"Cannot reach S3 endpoint: {e}") from e
