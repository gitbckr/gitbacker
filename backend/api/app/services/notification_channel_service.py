import uuid
from datetime import datetime, timezone

import apprise
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import notification_channel_repo
from shared.models import NotificationChannel, User
from shared.notifications import (
    ChannelConfigError,
    capture_apprise_logs,
    channel_to_apprise_url,
    format_apprise_failure,
    validate_channel_config,
)
from shared.schemas import (
    NotificationChannelCreate,
    NotificationChannelRead,
    NotificationChannelUpdate,
)


def _validate_or_422(channel_type, config: dict) -> None:
    try:
        validate_channel_config(channel_type, config)
    except ChannelConfigError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )


async def create_notification_channel(
    db: AsyncSession, user: User, body: NotificationChannelCreate
) -> NotificationChannelRead:
    # Pydantic already validated; this is the belt-and-braces check in case
    # a caller bypasses the schema (e.g. direct ORM construction in tests).
    _validate_or_422(body.channel_type, body.config_data)

    channel = NotificationChannel(
        name=body.name,
        channel_type=body.channel_type,
        config_data=body.config_data,
        enabled=body.enabled,
        on_backup_failure=body.on_backup_failure,
        on_restore_failure=body.on_restore_failure,
        on_repo_verification_failure=body.on_repo_verification_failure,
        on_disk_space_low=body.on_disk_space_low,
        created_by=user.id,
    )
    await notification_channel_repo.create(db, channel)
    await db.commit()
    await db.refresh(channel)
    return NotificationChannelRead.model_validate(channel)


async def list_notification_channels(
    db: AsyncSession,
) -> list[NotificationChannelRead]:
    channels = await notification_channel_repo.list_all(db)
    return [NotificationChannelRead.model_validate(c) for c in channels]


async def update_notification_channel(
    db: AsyncSession, channel_id: str, body: NotificationChannelUpdate
) -> NotificationChannelRead:
    channel = await notification_channel_repo.get_by_id(db, uuid.UUID(channel_id))
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )

    fields = body.model_dump(exclude_unset=True)
    if "config_data" in fields:
        _validate_or_422(channel.channel_type, fields["config_data"])

    await notification_channel_repo.update(db, channel, fields)
    await db.commit()
    await db.refresh(channel)
    return NotificationChannelRead.model_validate(channel)


async def delete_notification_channel(db: AsyncSession, channel_id: str) -> None:
    channel = await notification_channel_repo.get_by_id(db, uuid.UUID(channel_id))
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )
    await notification_channel_repo.delete(db, channel)
    await db.commit()


async def test_notification_channel(db: AsyncSession, channel_id: str) -> dict:
    """Send a test notification via Apprise and return the result."""
    channel = await notification_channel_repo.get_by_id(db, uuid.UUID(channel_id))
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )

    _validate_or_422(channel.channel_type, channel.config_data)

    try:
        url = channel_to_apprise_url(channel.channel_type, channel.config_data)
    except ChannelConfigError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    a = apprise.Apprise()
    if not a.add(url):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Apprise could not parse the channel URL",
        )

    title = f"\u2705 Test notification from Gitbacker"
    body = (
        f"Your notification channel **{channel.name}** is working correctly.\n\n"
        f"_Gitbacker \u00B7 "
        f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_"
    )
    with capture_apprise_logs() as records:
        ok = a.notify(title=title, body=body, body_format=apprise.NotifyFormat.MARKDOWN)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Notification dispatch failed: {format_apprise_failure(records)}",
        )

    return {"status": "sent"}
