import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.services import repository_service
from shared.models import BackupJob, User
from shared.schemas import BackupJobRead, RepoCreate, RepoRead, RepoUpdate

router = APIRouter()


@router.post("", response_model=list[RepoRead], status_code=status.HTTP_201_CREATED)
async def create_repositories(
    body: RepoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RepoRead]:
    return await repository_service.create_repositories(db, user, body)


@router.get("", response_model=list[RepoRead])
async def list_repositories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RepoRead]:
    return await repository_service.list_repositories(db, user)


@router.get("/{repo_id}", response_model=RepoRead)
async def get_repository(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RepoRead:
    return await repository_service.get_repository(db, user, str(repo_id))


@router.patch("/{repo_id}", response_model=RepoRead)
async def update_repository(
    repo_id: uuid.UUID,
    body: RepoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RepoRead:
    return await repository_service.update_repository(db, user, str(repo_id), body)


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await repository_service.delete_repository(db, user, str(repo_id))


@router.post("/{repo_id}/backup", response_model=BackupJobRead, status_code=status.HTTP_201_CREATED)
async def trigger_backup(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BackupJob:
    return await repository_service.trigger_backup(db, user, str(repo_id))


@router.get("/{repo_id}/jobs", response_model=list[BackupJobRead])
async def list_backup_jobs(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BackupJob]:
    return await repository_service.list_backup_jobs(db, user, str(repo_id))
