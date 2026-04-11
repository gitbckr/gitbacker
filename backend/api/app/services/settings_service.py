from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import GlobalSettings
from shared.schemas import GlobalSettingsRead, GlobalSettingsUpdate


async def get_settings(db: AsyncSession) -> GlobalSettingsRead:
    result = await db.execute(select(GlobalSettings).where(GlobalSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        row = GlobalSettings(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return GlobalSettingsRead.model_validate(row)


async def update_settings(
    db: AsyncSession, body: GlobalSettingsUpdate
) -> GlobalSettingsRead:
    result = await db.execute(select(GlobalSettings).where(GlobalSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        row = GlobalSettings(id=1)
        db.add(row)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    await db.commit()
    await db.refresh(row)
    return GlobalSettingsRead.model_validate(row)
