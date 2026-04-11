from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.services import settings_service
from shared.models import User
from shared.schemas import GlobalSettingsRead, GlobalSettingsUpdate

router = APIRouter()


@router.get("", response_model=GlobalSettingsRead)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GlobalSettingsRead:
    return await settings_service.get_settings(db)


@router.patch("", response_model=GlobalSettingsRead)
async def update_settings(
    body: GlobalSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> GlobalSettingsRead:
    return await settings_service.update_settings(db, body)
