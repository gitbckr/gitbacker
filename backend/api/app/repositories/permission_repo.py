import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import RepoPermissionEntry


async def get_permission(
    db: AsyncSession, user_id: uuid.UUID, repo_id: uuid.UUID
) -> RepoPermissionEntry | None:
    result = await db.execute(
        select(RepoPermissionEntry).where(
            RepoPermissionEntry.user_id == user_id,
            RepoPermissionEntry.repo_id == repo_id,
        )
    )
    return result.scalar_one_or_none()
