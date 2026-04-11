import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.enums import IdentityProvider
from shared.models import User, UserIdentity


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_identity(
    db: AsyncSession, user_id: uuid.UUID, provider: IdentityProvider = IdentityProvider.LOCAL
) -> UserIdentity | None:
    result = await db.execute(
        select(UserIdentity).where(
            UserIdentity.user_id == user_id,
            UserIdentity.provider == provider,
        )
    )
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def create(db: AsyncSession, user: User) -> User:
    db.add(user)
    await db.flush()
    return user


async def create_identity(db: AsyncSession, identity: UserIdentity) -> UserIdentity:
    db.add(identity)
    return identity


async def update(db: AsyncSession, user: User, fields: dict) -> User:
    for field, value in fields.items():
        setattr(user, field, value)
    await db.flush()
    return user
