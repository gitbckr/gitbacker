import pytest
from fastapi import HTTPException

from app.auth import create_token
from app.services import auth_service


async def test_authenticate_success(db_session, admin_user):
    result = await auth_service.authenticate(db_session, "admin@test.com", "adminpass")
    assert result.access_token
    assert result.refresh_token
    assert result.token_type == "bearer"


async def test_authenticate_wrong_password(db_session, admin_user):
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate(db_session, "admin@test.com", "wrongpass")
    assert exc_info.value.status_code == 401


async def test_authenticate_nonexistent_email(db_session):
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate(db_session, "nobody@test.com", "pass")
    assert exc_info.value.status_code == 401


async def test_authenticate_inactive_user(db_session, admin_user):
    admin_user.is_active = False
    await db_session.flush()
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate(db_session, "admin@test.com", "adminpass")
    assert exc_info.value.status_code == 401


async def test_refresh_tokens_success(db_session, admin_user):
    refresh_token = create_token(admin_user.id, "refresh")
    result = await auth_service.refresh_tokens(db_session, refresh_token)
    assert result.access_token
    assert result.refresh_token


async def test_refresh_with_access_token(db_session, admin_user):
    access_token = create_token(admin_user.id, "access")
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_tokens(db_session, access_token)
    assert exc_info.value.status_code == 401
