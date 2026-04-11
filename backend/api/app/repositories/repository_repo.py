import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Repository, RepoPermissionEntry


async def get_by_id(db: AsyncSession, repo_id: uuid.UUID) -> Repository | None:
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[Repository]:
    result = await db.execute(select(Repository).order_by(Repository.created_at))
    return list(result.scalars().all())


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[Repository]:
    own = await db.execute(
        select(Repository).where(Repository.created_by == user_id).order_by(Repository.created_at)
    )
    shared = await db.execute(
        select(Repository)
        .join(RepoPermissionEntry)
        .where(RepoPermissionEntry.user_id == user_id)
        .order_by(Repository.created_at)
    )
    seen: set[uuid.UUID] = set()
    repos: list[Repository] = []
    for repo in list(own.scalars().all()) + list(shared.scalars().all()):
        if repo.id not in seen:
            seen.add(repo.id)
            repos.append(repo)
    return repos


async def create(db: AsyncSession, repo: Repository) -> Repository:
    db.add(repo)
    await db.flush()
    return repo


async def update(db: AsyncSession, repo: Repository, fields: dict) -> Repository:
    for field, value in fields.items():
        setattr(repo, field, value)
    await db.flush()
    return repo


async def get_by_urls_and_destination(
    db: AsyncSession, urls: list[str], destination_id: uuid.UUID
) -> list[Repository]:
    result = await db.execute(
        select(Repository).where(
            Repository.url.in_(urls),
            Repository.destination_id == destination_id,
        )
    )
    return list(result.scalars().all())


async def delete(db: AsyncSession, repo: Repository) -> None:
    await db.delete(repo)
