import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.db import get_db
from app.services import notification_channel_service
from shared.models import User
from shared.schemas import (
    NotificationChannelCreate,
    NotificationChannelRead,
    NotificationChannelUpdate,
)

router = APIRouter()


@router.post(
    "", response_model=NotificationChannelRead, status_code=status.HTTP_201_CREATED
)
async def create_notification_channel(
    body: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> NotificationChannelRead:
    return await notification_channel_service.create_notification_channel(
        db, user, body
    )


@router.get("", response_model=list[NotificationChannelRead])
async def list_notification_channels(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[NotificationChannelRead]:
    return await notification_channel_service.list_notification_channels(db)


@router.patch("/{channel_id}", response_model=NotificationChannelRead)
async def update_notification_channel(
    channel_id: uuid.UUID,
    body: NotificationChannelUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> NotificationChannelRead:
    return await notification_channel_service.update_notification_channel(
        db, str(channel_id), body
    )


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification_channel(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> None:
    await notification_channel_service.delete_notification_channel(
        db, str(channel_id)
    )


@router.post("/{channel_id}/test")
async def test_notification_channel(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> dict:
    return await notification_channel_service.test_notification_channel(
        db, str(channel_id)
    )
