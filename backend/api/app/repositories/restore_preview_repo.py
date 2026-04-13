import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import RestorePreview


async def get_by_id(db: AsyncSession, preview_id: uuid.UUID) -> RestorePreview | None:
    result = await db.execute(
        select(RestorePreview).where(RestorePreview.id == preview_id)
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, preview: RestorePreview) -> RestorePreview:
    db.add(preview)
    await db.flush()
    return preview
