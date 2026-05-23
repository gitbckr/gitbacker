import pytest

from shared.enums import StorageType
from shared.storage import StorageConfigError, validate_destination_config


def test_local_requires_path():
    with pytest.raises(StorageConfigError, match="path is required"):
        validate_destination_config(StorageType.LOCAL, None, None)


def test_local_rejects_config():
    with pytest.raises(StorageConfigError, match="must be empty"):
        validate_destination_config(StorageType.LOCAL, {"bucket": "x"}, "/data")


def test_s3_requires_config():
    with pytest.raises(StorageConfigError, match="config_data is required"):
        validate_destination_config(StorageType.S3, None, None)


@pytest.mark.parametrize("bucket", ["AB", "Capital", "with_underscore", "..bad", ""])
def test_s3_bucket_name_validation(bucket):
    cfg = {
        "bucket": bucket,
        "access_key_id": "k",
        "secret_access_key": "s",
    }
    with pytest.raises(StorageConfigError):
        validate_destination_config(StorageType.S3, cfg, "")


def test_s3_minimal_valid():
    validate_destination_config(
        StorageType.S3,
        {
            "bucket": "my-backups",
            "access_key_id": "AKIA1234",
            "secret_access_key": "secret",
        },
        "",
    )


def test_s3_missing_secret_rejected():
    cfg = {"bucket": "my-backups", "access_key_id": "AKIA"}
    with pytest.raises(StorageConfigError, match="secret_access_key"):
        validate_destination_config(StorageType.S3, cfg, "")


def test_s3_private_endpoint_blocked():
    cfg = {
        "bucket": "my-backups",
        "endpoint_url": "http://127.0.0.1:9000",
        "access_key_id": "k",
        "secret_access_key": "s",
    }
    with pytest.raises(StorageConfigError, match="private/internal"):
        validate_destination_config(StorageType.S3, cfg, "")


def test_s3_private_endpoint_allowed_with_escape_hatch():
    cfg = {
        "bucket": "my-backups",
        "endpoint_url": "http://127.0.0.1:9000",
        "allow_private_endpoint": True,
        "access_key_id": "k",
        "secret_access_key": "s",
    }
    validate_destination_config(StorageType.S3, cfg, "")


def test_s3_bad_prefix():
    cfg = {
        "bucket": "my-backups",
        "prefix": "/leading/slash",
        "access_key_id": "k",
        "secret_access_key": "s",
    }
    with pytest.raises(StorageConfigError, match="prefix must not start"):
        validate_destination_config(StorageType.S3, cfg, "")
