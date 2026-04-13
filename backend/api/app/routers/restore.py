import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.services import restore_service
from shared.models import BackupSnapshot, RestoreJob, RestorePreview, User
from shared.schemas import (
    BackupSnapshotRead,
    RestoreJobCreate,
    RestoreJobRead,
    RestorePreviewCreate,
    RestorePreviewRead,
)

router = APIRouter()


@router.get(
    "/{repo_id}/snapshots",
    response_model=list[BackupSnapshotRead],
)
async def list_snapshots(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BackupSnapshot]:
    return await restore_service.list_snapshots(db, user, str(repo_id))


@router.post(
    "/{repo_id}/restore",
    response_model=RestoreJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_restore(
    repo_id: uuid.UUID,
    body: RestoreJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RestoreJob:
    return await restore_service.trigger_restore(db, user, str(repo_id), body)


@router.get(
    "/{repo_id}/restore-jobs",
    response_model=list[RestoreJobRead],
)
async def list_restore_jobs(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RestoreJob]:
    return await restore_service.list_restore_jobs(db, user, str(repo_id))


@router.get(
    "/{repo_id}/restore-jobs/{job_id}",
    response_model=RestoreJobRead,
)
async def get_restore_job(
    repo_id: uuid.UUID,
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RestoreJob:
    return await restore_service.get_restore_job(db, user, str(repo_id), str(job_id))


# --- Restore Previews ---


@router.post(
    "/{repo_id}/restore-preview",
    response_model=RestorePreviewRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_restore_preview(
    repo_id: uuid.UUID,
    body: RestorePreviewCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RestorePreview:
    return await restore_service.trigger_restore_preview(db, user, str(repo_id), body)


@router.get(
    "/{repo_id}/restore-preview/{preview_id}",
    response_model=RestorePreviewRead,
)
async def get_restore_preview(
    repo_id: uuid.UUID,
    preview_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RestorePreview:
    return await restore_service.get_restore_preview(
        db, user, str(repo_id), str(preview_id)
    )


@router.post(
    "/{repo_id}/restore-preview/{preview_id}/detail",
    response_model=RestorePreviewRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_detailed_preview(
    repo_id: uuid.UUID,
    preview_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RestorePreview:
    return await restore_service.trigger_detailed_preview(
        db, user, str(repo_id), str(preview_id)
    )
