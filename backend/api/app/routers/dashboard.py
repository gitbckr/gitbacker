from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.services import dashboard_service
from shared.models import User
from shared.schemas import DailyActivitySummary

router = APIRouter()


@router.get("/activity", response_model=list[DailyActivitySummary])
async def get_backup_activity(
    days: int = Query(default=365, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DailyActivitySummary]:
    return await dashboard_service.get_backup_activity(db, user, days=days)
