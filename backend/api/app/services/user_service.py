import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password
from app.repositories import user_repo
from shared.enums import IdentityProvider
from shared.models import User, UserIdentity
from shared.schemas import PasswordChange, UserCreate, UserUpdate


async def create_user(db: AsyncSession, body: UserCreate) -> User:
    existing = await user_repo.get_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=body.email, name=body.name, role=body.role)
    await user_repo.create(db, user)

    identity = UserIdentity(
        user_id=user.id,
        provider=IdentityProvider.LOCAL,
        provider_key=body.email,
        secret_hash=hash_password(body.password),
    )
    await user_repo.create_identity(db, identity)
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(db: AsyncSession) -> list[User]:
    return await user_repo.list_all(db)


async def update_user(
    db: AsyncSession, user_id: str, body: UserUpdate, current_user: User
) -> User:
    if str(current_user.id) == user_id:
        if body.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )
        if body.role is not None and body.role != current_user.role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role",
            )

    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await user_repo.update(db, user, body.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: str, current_user: User) -> None:
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()


async def change_password(db: AsyncSession, user: User, body: PasswordChange) -> None:
    identity = await user_repo.get_identity(db, user.id, IdentityProvider.LOCAL)
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No local password set for this account",
        )

    if not verify_password(body.current_password, identity.secret_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        )

    identity.secret_hash = hash_password(body.new_password)
    await db.commit()
