import pytest
from pydantic import ValidationError

from shared.schemas import DestinationCreate, RepoCreate, UserCreate


def test_repo_create_valid_urls():
    schema = RepoCreate(urls=[
        "https://github.com/user/repo",
        "http://example.com/repo",
        "git://example.com/repo",
        "ssh://git@example.com/repo",
    ])
    assert len(schema.urls) == 4


def test_repo_create_rejects_ftp():
    with pytest.raises(ValidationError):
        RepoCreate(urls=["ftp://example.com/repo"])


def test_repo_create_rejects_no_scheme():
    with pytest.raises(ValidationError):
        RepoCreate(urls=["just-a-string"])


def test_repo_create_max_100_urls():
    urls_100 = [f"https://example.com/repo{i}" for i in range(100)]
    schema = RepoCreate(urls=urls_100)
    assert len(schema.urls) == 100

    urls_101 = [f"https://example.com/repo{i}" for i in range(101)]
    with pytest.raises(ValidationError):
        RepoCreate(urls=urls_101)


def test_repo_create_strips_whitespace():
    # Validator strips whitespace for checking but preserves original value
    schema = RepoCreate(urls=[" https://example.com/repo "])
    assert len(schema.urls) == 1


def test_repo_create_skips_empty_strings():
    # Empty strings are skipped during validation
    schema = RepoCreate(urls=["", "https://example.com/repo"])
    assert len(schema.urls) == 2


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="notanemail", name="Test", password="test")


def test_user_create_defaults_to_operator():
    user = UserCreate(email="test@example.com", name="Test", password="test")
    assert user.role.value == "operator"


def test_destination_create_defaults():
    dest = DestinationCreate(alias="Test", path="/tmp/backups")
    assert dest.storage_type.value == "local"
    assert dest.is_default is False
