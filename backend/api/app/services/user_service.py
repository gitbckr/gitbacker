import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.repositories import user_repo
from shared.enums import IdentityProvider
from shared.models import User, UserIdentity
from shared.schemas import UserCreate, UserUpdate


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


async def update_user(db: AsyncSession, user_id: str, body: UserUpdate) -> User:
    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await user_repo.update(db, user, body.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(user)
    return user
