import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import GitCredential


async def get_by_id(db: AsyncSession, cred_id: uuid.UUID) -> GitCredential | None:
    result = await db.execute(
        select(GitCredential).where(GitCredential.id == cred_id)
    )
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[GitCredential]:
    result = await db.execute(
        select(GitCredential).order_by(GitCredential.created_at)
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, cred: GitCredential) -> GitCredential:
    db.add(cred)
    await db.flush()
    return cred


async def delete(db: AsyncSession, cred: GitCredential) -> None:
    await db.delete(cred)
