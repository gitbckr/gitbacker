import pytest

from shared.storage_backends import StorageBackendError
from shared.storage_backends.local import LocalStorageBackend


@pytest.fixture
def backend(tmp_path):
    return LocalStorageBackend(tmp_path)


def test_round_trip(tmp_path, backend):
    src = tmp_path / "input.bin"
    src.write_bytes(b"hello world")

    size = backend.upload(src, "out.bin")
    assert size == len(b"hello world")
    assert not src.exists()  # move semantics
    assert (tmp_path / "out.bin").read_bytes() == b"hello world"

    dst = tmp_path / "downloaded.bin"
    backend.download("out.bin", dst)
    assert dst.read_bytes() == b"hello world"
    # download is copy — source still there.
    assert (tmp_path / "out.bin").exists()

    backend.delete("out.bin")
    assert not (tmp_path / "out.bin").exists()


def test_download_missing_raises(tmp_path, backend):
    with pytest.raises(StorageBackendError, match="not found"):
        backend.download("nope", tmp_path / "x")


def test_delete_missing_is_noop(backend):
    backend.delete("nope")  # must not raise


@pytest.mark.parametrize("bad_key", ["../escape", "/abs/path", "a/../b"])
def test_traversal_rejected(tmp_path, backend, bad_key):
    src = tmp_path / "src"
    src.write_bytes(b"x")
    with pytest.raises(StorageBackendError, match="Invalid storage key"):
        backend.upload(src, bad_key)


def test_validate_config_writable_dir(backend, tmp_path):
    backend.validate_config()
    # Probe file should be cleaned up.
    assert list(tmp_path.iterdir()) == []
