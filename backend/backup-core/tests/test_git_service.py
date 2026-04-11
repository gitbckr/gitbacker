import subprocess
from unittest.mock import MagicMock, patch

import pytest

from services.git_service import _validate_url, clone_mirror, verify_access


def test_validate_url_valid_schemes():
    for url in [
        "https://github.com/user/repo",
        "ssh://git@host/repo",
        "git@github.com:user/repo",
        "git://example.com/repo",
    ]:
        _validate_url(url)  # Should not raise


def test_validate_url_rejects_dash():
    with pytest.raises(ValueError, match="starts with dash"):
        _validate_url("-evil")


def test_validate_url_rejects_ext():
    with pytest.raises(ValueError, match="ext::"):
        _validate_url("ext::sh -c 'evil'")


def test_validate_url_rejects_ftp():
    with pytest.raises(ValueError, match="not allowed"):
        _validate_url("ftp://example.com/repo")


@patch("services.git_service.subprocess.run")
def test_verify_access_success(mock_run):
    mock_run.return_value = MagicMock(returncode=0)
    success, error = verify_access("https://github.com/user/repo")
    assert success is True
    assert error is None


@patch("services.git_service.subprocess.run")
def test_verify_access_failure(mock_run):
    mock_run.return_value = MagicMock(
        returncode=128, stderr="fatal: repository not found"
    )
    success, error = verify_access("https://github.com/user/repo")
    assert success is False
    assert error is not None


@patch("services.git_service.subprocess.run")
def test_verify_access_timeout(mock_run):
    mock_run.side_effect = subprocess.TimeoutExpired(cmd="git", timeout=30)
    success, error = verify_access("https://github.com/user/repo")
    assert success is False
    assert "Timeout" in error


@patch("services.git_service.subprocess.run")
def test_clone_mirror_success(mock_run):
    mock_run.return_value = MagicMock(returncode=0, stdout="Cloning...", stderr="")
    success, output = clone_mirror("https://github.com/user/repo", "/tmp/dest")
    assert success is True
    assert "Cloning" in output


@patch("services.git_service.subprocess.run")
def test_clone_mirror_failure(mock_run):
    mock_run.return_value = MagicMock(
        returncode=128, stdout="", stderr="fatal: clone failed"
    )
    success, output = clone_mirror("https://github.com/user/repo", "/tmp/dest")
    assert success is False


@patch("services.git_service.subprocess.run")
def test_clone_mirror_timeout(mock_run):
    mock_run.side_effect = subprocess.TimeoutExpired(cmd="git", timeout=300)
    success, output = clone_mirror("https://github.com/user/repo", "/tmp/dest")
    assert success is False
    assert "Timeout" in output
