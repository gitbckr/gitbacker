import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import EncryptionKey


async def get_by_id(db: AsyncSession, key_id: uuid.UUID) -> EncryptionKey | None:
    result = await db.execute(select(EncryptionKey).where(EncryptionKey.id == key_id))
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[EncryptionKey]:
    result = await db.execute(select(EncryptionKey).order_by(EncryptionKey.created_at))
    return list(result.scalars().all())


async def create(db: AsyncSession, key: EncryptionKey) -> EncryptionKey:
    db.add(key)
    await db.flush()
    return key


async def delete(db: AsyncSession, key: EncryptionKey) -> None:
    await db.delete(key)
