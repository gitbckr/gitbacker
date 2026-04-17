import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.auth import get_current_user
from app.db import get_db
from main import app as fastapi_app


@pytest_asyncio.fixture
async def client(engine, db_session, admin_user, default_destination):
    await db_session.commit()

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_current_user] = lambda: admin_user

    with (
        patch("app.services.repository_service.celery"),
        patch(
            "app.services.destination_service._get_available_bytes",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("app.services.destination_service.BACKUP_ROOT", Path(tempfile.gettempdir())),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=fastapi_app), base_url="http://test"
        ) as ac:
            yield ac

    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def unauth_client(engine, db_session, admin_user):
    await db_session.commit()

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db

    with (
        patch(
            "app.services.destination_service._get_available_bytes",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("app.services.destination_service.BACKUP_ROOT", Path(tempfile.gettempdir())),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=fastapi_app), base_url="http://test"
        ) as ac:
            yield ac

    fastapi_app.dependency_overrides.clear()
