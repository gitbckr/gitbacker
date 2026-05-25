import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from app.services import destination_service
from shared.enums import StorageType
from shared.models import Destination
from shared.schemas import DestinationCreate

# Shared patches: BACKUP_ROOT=/tmp so test paths like /tmp/test pass,
# mkdir is no-op, disk check returns None.
_patches = {
    "root": patch("app.services.destination_service.BACKUP_ROOT", Path(tempfile.gettempdir())),
    "mkdir": patch("app.services.destination_service.Path.mkdir", MagicMock()),
    "avail": patch(
        "app.services.destination_service._get_available_bytes",
        new_callable=AsyncMock,
        return_value=None,
    ),
}


def _apply_patches():
    mocks = {k: p.start() for k, p in _patches.items()}
    return mocks


def _stop_patches():
    for p in _patches.values():
        p.stop()


@pytest.fixture(autouse=True)
def _patch_destination_service():
    _apply_patches()
    yield
    _stop_patches()


async def test_create_destination(db_session, admin_user):
    body = DestinationCreate(alias="Test Dest", path=f"{tempfile.gettempdir()}/test")
    result = await destination_service.create_destination(db_session, admin_user, body)
    assert result.alias == "Test Dest"
    assert result.storage_type == StorageType.LOCAL
    assert result.is_default is False


async def test_create_default_clears_old_default(db_session, admin_user):
    body1 = DestinationCreate(alias="First", path=f"{tempfile.gettempdir()}/first", is_default=True)
    first = await destination_service.create_destination(db_session, admin_user, body1)
    assert first.is_default is True

    body2 = DestinationCreate(alias="Second", path=f"{tempfile.gettempdir()}/second", is_default=True)
    second = await destination_service.create_destination(db_session, admin_user, body2)
    assert second.is_default is True

    db_session.expire_all()
    refreshed_first = await db_session.get(Destination, first.id)
    assert refreshed_first.is_default is False


async def test_list_destinations(db_session, admin_user):
    body = DestinationCreate(alias="Listed", path=f"{tempfile.gettempdir()}/listed")
    await destination_service.create_destination(db_session, admin_user, body)

    results = await destination_service.list_destinations(db_session)
    assert len(results) >= 1
    aliases = {d.alias for d in results}
    assert "Listed" in aliases


async def test_delete_destination(db_session, admin_user):
    body = DestinationCreate(alias="ToDelete", path=f"{tempfile.gettempdir()}/delete")
    created = await destination_service.create_destination(db_session, admin_user, body)

    await destination_service.delete_destination(db_session, str(created.id))

    results = await destination_service.list_destinations(db_session)
    aliases = {d.alias for d in results}
    assert "ToDelete" not in aliases


# --- S3 destinations + secret handling ---


_S3_CONFIG = {
    "bucket": "my-backups",
    "region": "us-east-1",
    "access_key_id": "AKIA1234",
    "secret_access_key": "TOPSECRET",
}


@patch("app.services.destination_service._APP_SECRET", "test-secret-32bytes-padding-pad")
async def test_create_s3_encrypts_secret(db_session, admin_user):
    body = DestinationCreate(
        alias="My S3", storage_type=StorageType.S3, config_data=dict(_S3_CONFIG)
    )
    result = await destination_service.create_destination(db_session, admin_user, body)

    # Read schema must strip the secret — even though we just wrote it.
    assert "secret_access_key" not in (result.config_data or {})
    # Access key id IS still visible (it's an identifier, not a secret).
    assert result.config_data["access_key_id"] == "AKIA1234"

    # Inspect the raw row: stored secret is ciphertext, not the plaintext.
    db_session.expire_all()
    raw = await db_session.get(Destination, result.id)
    assert raw.config_data["secret_access_key"] != "TOPSECRET"
    assert raw.config_data["secret_access_key"]  # but not empty


@patch("app.services.destination_service._APP_SECRET", "test-secret-32bytes-padding-pad")
async def test_update_preserves_existing_secret_when_omitted(
    db_session, admin_user
):
    body = DestinationCreate(
        alias="My S3", storage_type=StorageType.S3, config_data=dict(_S3_CONFIG)
    )
    created = await destination_service.create_destination(db_session, admin_user, body)

    raw_before = await db_session.get(Destination, created.id)
    stored_secret = raw_before.config_data["secret_access_key"]

    # Update bucket only — omit secret_access_key entirely.
    from shared.schemas import DestinationUpdate
    new_cfg = {k: v for k, v in _S3_CONFIG.items() if k != "secret_access_key"}
    new_cfg["bucket"] = "new-bucket"
    await destination_service.update_destination(
        db_session, str(created.id),
        DestinationUpdate(config_data=new_cfg),
    )

    db_session.expire_all()
    raw_after = await db_session.get(Destination, created.id)
    assert raw_after.config_data["bucket"] == "new-bucket"
    # Stored secret unchanged — same ciphertext, same plaintext after decrypt.
    assert raw_after.config_data["secret_access_key"] == stored_secret


async def test_quota_field_round_trip(db_session, admin_user):
    body = DestinationCreate(
        alias="With Quota",
        path=f"{tempfile.gettempdir()}/quota",
        quota_bytes=10 * 1024**3,
    )
    result = await destination_service.create_destination(db_session, admin_user, body)
    assert result.quota_bytes == 10 * 1024**3
