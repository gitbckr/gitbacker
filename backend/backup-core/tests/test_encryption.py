from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from shared.enums import EncryptionBackend
from shared.models import EncryptionKey
from services.encryption import get_encryption_provider
from services.encryption.gpg import GpgEncryptionProvider


# --- Factory tests ---


def test_get_encryption_provider_gpg():
    key = MagicMock(spec=EncryptionKey)
    key.backend = EncryptionBackend.GPG
    key.key_data = "my-secret-passphrase"

    provider = get_encryption_provider(key)

    assert isinstance(provider, GpgEncryptionProvider)


def test_get_encryption_provider_unknown():
    key = MagicMock(spec=EncryptionKey)
    key.backend = "unknown"

    with pytest.raises(ValueError, match="Unknown encryption backend"):
        get_encryption_provider(key)


# --- GPG symmetric provider tests ---


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_encrypt_file_success(mock_run):
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    provider = GpgEncryptionProvider("my-passphrase")
    provider.encrypt_file(Path("/tmp/in.tar.gz"), Path("/tmp/out.tar.gz.gpg"))

    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert "gpg" in args
    assert "--symmetric" in args
    assert "--cipher-algo" in args
    assert "AES256" in args
    assert "--passphrase-fd" in args
    assert "0" in args
    # Passphrase passed via stdin
    assert mock_run.call_args[1]["input"] == "my-passphrase"


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_encrypt_file_failure(mock_run):
    mock_run.return_value = MagicMock(returncode=1, stderr="gpg: error")

    provider = GpgEncryptionProvider("my-passphrase")

    with pytest.raises(RuntimeError, match="GPG encryption failed"):
        provider.encrypt_file(Path("/tmp/in.tar.gz"), Path("/tmp/out.tar.gz.gpg"))


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_decrypt_file_success(mock_run):
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    provider = GpgEncryptionProvider("my-passphrase")
    provider.decrypt_file(Path("/tmp/in.tar.gz.gpg"), Path("/tmp/out.tar.gz"))

    args = mock_run.call_args[0][0]
    assert "--decrypt" in args
    assert "--passphrase-fd" in args
    assert mock_run.call_args[1]["input"] == "my-passphrase"


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_decrypt_file_failure(mock_run):
    mock_run.return_value = MagicMock(returncode=1, stderr="gpg: decrypt error")

    provider = GpgEncryptionProvider("my-passphrase")

    with pytest.raises(RuntimeError, match="GPG decryption failed"):
        provider.decrypt_file(Path("/tmp/in.tar.gz.gpg"), Path("/tmp/out.tar.gz"))


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_validate_config_success(mock_run):
    mock_run.return_value = MagicMock(returncode=0)

    provider = GpgEncryptionProvider("my-passphrase")
    provider.validate_config()  # should not raise

    assert mock_run.call_count == 1  # just --version check


@patch("services.encryption.gpg.subprocess.run")
def test_gpg_validate_config_missing_binary(mock_run):
    mock_run.side_effect = FileNotFoundError()

    provider = GpgEncryptionProvider("my-passphrase")

    with pytest.raises(RuntimeError, match="GPG binary not found"):
        provider.validate_config()
