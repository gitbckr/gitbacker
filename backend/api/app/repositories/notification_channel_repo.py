import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import NotificationChannel


async def get_by_id(
    db: AsyncSession, channel_id: uuid.UUID
) -> NotificationChannel | None:
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.id == channel_id)
    )
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[NotificationChannel]:
    result = await db.execute(
        select(NotificationChannel).order_by(NotificationChannel.created_at)
    )
    return list(result.scalars().all())


async def create(
    db: AsyncSession, channel: NotificationChannel
) -> NotificationChannel:
    db.add(channel)
    await db.flush()
    return channel


async def update(
    db: AsyncSession, channel: NotificationChannel, fields: dict
) -> NotificationChannel:
    for field, value in fields.items():
        setattr(channel, field, value)
    await db.flush()
    return channel


async def delete(db: AsyncSession, channel: NotificationChannel) -> None:
    await db.delete(channel)
