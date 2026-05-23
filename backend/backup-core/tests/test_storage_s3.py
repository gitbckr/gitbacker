import boto3
import pytest
from moto import mock_aws

from shared.storage_backends import StorageBackendError
from shared.storage_backends.s3 import S3StorageBackend


BUCKET = "gitbacker-test"


@pytest.fixture
def s3_backend():
    with mock_aws():
        # Provision the bucket the backend will write into.
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=BUCKET)
        yield S3StorageBackend(
            bucket=BUCKET,
            prefix="archives",
            region="us-east-1",
            endpoint_url=None,
            access_key_id="test",
            secret_access_key="test",
        )


def test_round_trip(tmp_path, s3_backend):
    src = tmp_path / "in.bin"
    payload = b"a" * 1024
    src.write_bytes(payload)

    size = s3_backend.upload(src, "repo_2026.tar.gz")
    assert size == len(payload)

    dst = tmp_path / "out.bin"
    s3_backend.download("repo_2026.tar.gz", dst)
    assert dst.read_bytes() == payload

    s3_backend.delete("repo_2026.tar.gz")
    with pytest.raises(StorageBackendError):
        s3_backend.download("repo_2026.tar.gz", tmp_path / "x")


def test_validate_config(s3_backend):
    s3_backend.validate_config()


def test_validate_config_missing_bucket():
    with mock_aws():
        backend = S3StorageBackend(
            bucket="does-not-exist",
            region="us-east-1",
            access_key_id="test",
            secret_access_key="test",
        )
        with pytest.raises(StorageBackendError, match="does not exist"):
            backend.validate_config()


def test_traversal_rejected(tmp_path, s3_backend):
    src = tmp_path / "in"
    src.write_bytes(b"x")
    with pytest.raises(StorageBackendError, match="Invalid storage key"):
        s3_backend.upload(src, "../escape")


def test_prefix_join(tmp_path, s3_backend):
    src = tmp_path / "in.bin"
    src.write_bytes(b"x")
    s3_backend.upload(src, "myfile")

    # Verify the object actually landed under the configured prefix.
    raw = boto3.client("s3", region_name="us-east-1").get_object(
        Bucket=BUCKET, Key="archives/myfile"
    )
    assert raw["Body"].read() == b"x"
