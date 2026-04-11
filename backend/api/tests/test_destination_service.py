from unittest.mock import AsyncMock, patch

from app.services import destination_service
from shared.enums import StorageType
from shared.models import Destination
from shared.schemas import DestinationCreate


@patch(
    "app.services.destination_service._get_available_bytes",
    new_callable=AsyncMock,
    return_value=None,
)
async def test_create_destination(mock_avail, db_session, admin_user):
    body = DestinationCreate(alias="Test Dest", path="/tmp/test")
    result = await destination_service.create_destination(db_session, admin_user, body)
    assert result.alias == "Test Dest"
    assert result.storage_type == StorageType.LOCAL
    assert result.is_default is False


@patch(
    "app.services.destination_service._get_available_bytes",
    new_callable=AsyncMock,
    return_value=None,
)
async def test_create_default_clears_old_default(mock_avail, db_session, admin_user):
    body1 = DestinationCreate(
        alias="First", path="/tmp/first", is_default=True
    )
    first = await destination_service.create_destination(db_session, admin_user, body1)
    assert first.is_default is True

    body2 = DestinationCreate(
        alias="Second", path="/tmp/second", is_default=True
    )
    second = await destination_service.create_destination(db_session, admin_user, body2)
    assert second.is_default is True

    # Refresh the first destination to see the updated is_default
    await db_session.refresh(
        await db_session.get(Destination, first.id)
    )
    refreshed_first = await db_session.get(Destination, first.id)
    assert refreshed_first.is_default is False


@patch(
    "app.services.destination_service._get_available_bytes",
    new_callable=AsyncMock,
    return_value=None,
)
async def test_list_destinations(mock_avail, db_session, admin_user):
    body = DestinationCreate(alias="Listed", path="/tmp/listed")
    await destination_service.create_destination(db_session, admin_user, body)

    results = await destination_service.list_destinations(db_session)
    assert len(results) >= 1
    aliases = {d.alias for d in results}
    assert "Listed" in aliases


@patch(
    "app.services.destination_service._get_available_bytes",
    new_callable=AsyncMock,
    return_value=None,
)
async def test_delete_destination(mock_avail, db_session, admin_user):
    body = DestinationCreate(alias="ToDelete", path="/tmp/delete")
    created = await destination_service.create_destination(
        db_session, admin_user, body
    )

    await destination_service.delete_destination(db_session, str(created.id))

    results = await destination_service.list_destinations(db_session)
    aliases = {d.alias for d in results}
    assert "ToDelete" not in aliases
