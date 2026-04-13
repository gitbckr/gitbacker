from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.services import user_service
from shared.models import User
from shared.schemas import PasswordChange, UserCreate, UserRead, UserUpdate

router = APIRouter()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    return await user_service.create_user(db, body)


@router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await user_service.change_password(db, user, body)


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[User]:
    return await user_service.list_users(db)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    return await user_service.update_user(db, user_id, body, admin)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    await user_service.delete_user(db, user_id, admin)
