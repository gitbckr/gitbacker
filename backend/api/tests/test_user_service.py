import pytest
from fastapi import HTTPException

from app.services import user_service
from shared.schemas import UserCreate, UserUpdate


async def test_create_user_success(db_session):
    body = UserCreate(
        email="new@test.com", name="New User", password="password123"
    )
    user = await user_service.create_user(db_session, body)
    assert user.email == "new@test.com"
    assert user.name == "New User"
    assert user.role.value == "operator"


async def test_create_user_duplicate_email(db_session, admin_user):
    body = UserCreate(
        email="admin@test.com", name="Duplicate", password="password123"
    )
    with pytest.raises(HTTPException) as exc_info:
        await user_service.create_user(db_session, body)
    assert exc_info.value.status_code == 409


async def test_list_users(db_session, admin_user, operator_user):
    users = await user_service.list_users(db_session)
    assert len(users) == 2
    emails = {u.email for u in users}
    assert "admin@test.com" in emails
    assert "operator@test.com" in emails


async def test_update_user(db_session, admin_user):
    body = UserUpdate(name="Updated Admin")
    user = await user_service.update_user(db_session, str(admin_user.id), body)
    assert user.name == "Updated Admin"


async def test_update_user_not_found(db_session):
    body = UserUpdate(name="Ghost")
    with pytest.raises(HTTPException) as exc_info:
        await user_service.update_user(
            db_session, "00000000-0000-0000-0000-000000000000", body
        )
    assert exc_info.value.status_code == 404
