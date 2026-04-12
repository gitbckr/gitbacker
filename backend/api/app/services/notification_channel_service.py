import json
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import notification_channel_repo
from shared.enums import NotificationChannelType
from shared.models import NotificationChannel, User
from shared.schemas import (
    NotificationChannelCreate,
    NotificationChannelRead,
    NotificationChannelUpdate,
)


def _validate_slack_config(config: dict) -> None:
    """Ensure Slack config_data has a valid webhook_url."""
    webhook_url = config.get("webhook_url", "")
    if not webhook_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="config_data.webhook_url is required for Slack channels",
        )
    if not webhook_url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="config_data.webhook_url must start with https://",
        )


async def create_notification_channel(
    db: AsyncSession, user: User, body: NotificationChannelCreate
) -> NotificationChannelRead:
    if body.channel_type == NotificationChannelType.SLACK:
        _validate_slack_config(body.config_data)

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
    channel = await notification_channel_repo.get_by_id(
        db, uuid.UUID(channel_id)
    )
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )

    fields = body.model_dump(exclude_unset=True)
    if "config_data" in fields and channel.channel_type == NotificationChannelType.SLACK:
        _validate_slack_config(fields["config_data"])

    await notification_channel_repo.update(db, channel, fields)
    await db.commit()
    await db.refresh(channel)
    return NotificationChannelRead.model_validate(channel)


async def delete_notification_channel(db: AsyncSession, channel_id: str) -> None:
    channel = await notification_channel_repo.get_by_id(
        db, uuid.UUID(channel_id)
    )
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )
    await notification_channel_repo.delete(db, channel)
    await db.commit()


async def test_notification_channel(db: AsyncSession, channel_id: str) -> dict:
    """Send a test notification and return the result."""
    channel = await notification_channel_repo.get_by_id(
        db, uuid.UUID(channel_id)
    )
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found",
        )

    if channel.channel_type == NotificationChannelType.SLACK:
        _validate_slack_config(channel.config_data)
        webhook_url = channel.config_data["webhook_url"]
        payload = json.dumps(
            {
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": ":white_check_mark: *Test notification from Gitbacker*",
                        },
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": (
                                f"Your notification channel *{channel.name}* "
                                "is working correctly."
                            ),
                        },
                    },
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "mrkdwn",
                                "text": (
                                    f"Gitbacker | "
                                    f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
                                ),
                            }
                        ],
                    },
                ]
            }
        ).encode()

        req = urllib.request.Request(
            webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status != 200:
                    body = resp.read().decode(errors="replace")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Slack returned {resp.status}: {body}",
                    )
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace") if e.fp else ""
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Slack webhook failed ({e.code}): {body}",
            )
        except urllib.error.URLError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not reach Slack: {e.reason}",
            )

    return {"status": "sent"}
