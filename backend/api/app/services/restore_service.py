import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery
from app.config import JWT_SECRET
from app.repositories import (
    destination_repo,
    encryption_key_repo,
    restore_job_repo,
    restore_preview_repo,
    snapshot_repo,
)
from app.services.repository_service import check_repo_access, get_repo_or_404
from shared.crypto import decrypt_field
from shared.enums import ArchiveFormat, JobStatus
from shared.models import BackupSnapshot, RestoreJob, RestorePreview, User
from shared.schemas import RestoreJobCreate, RestorePreviewCreate
from shared.task_signatures import (
    TASK_RUN_DETAILED_PREVIEW,
    TASK_RUN_RESTORE,
    TASK_RUN_RESTORE_PREVIEW,
)


async def get_snapshot_download_path(
    db: AsyncSession, user: User, repo_id: str, snapshot_id: str, decrypt: bool
) -> tuple[Path, str]:
    """Resolve the file path for a snapshot download. Returns (path, filename).

    If decrypt=True and the snapshot is encrypted, decrypts to a temp file and
    returns that path. Caller is responsible for cleanup of temp files.
    """
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    snapshot = await snapshot_repo.get_by_id(db, uuid.UUID(snapshot_id))
    if not snapshot or snapshot.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found for this repository",
        )

    destination = await destination_repo.get_by_id(db, snapshot.destination_id)
    if not destination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination not found",
        )

    dest_root = Path(destination.path).resolve()
    archive_path = (dest_root / snapshot.artifact_filename).resolve()
    if not archive_path.is_relative_to(dest_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid archive path",
        )
    if archive_path.is_symlink() or not archive_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archive file not found on disk",
        )

    if not decrypt or snapshot.archive_format != ArchiveFormat.TAR_GZ_GPG:
        return archive_path, snapshot.artifact_filename

    # Decrypt to temp file
    if not snapshot.encryption_key_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted snapshot has no encryption key recorded",
        )
    enc_key = await encryption_key_repo.get_by_id(db, snapshot.encryption_key_id)
    if not enc_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encryption key no longer exists",
        )

    passphrase = decrypt_field(enc_key.key_data, JWT_SECRET)
    decrypted_name = snapshot.artifact_filename.removesuffix(".gpg")
    tmp = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
    tmp.close()

    result = subprocess.run(
        [
            "gpg", "--decrypt", "--batch", "--yes",
            "--passphrase-fd", "0",
            "--output", tmp.name,
            str(archive_path),
        ],
        input=passphrase,
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        Path(tmp.name).unlink(missing_ok=True)
        import logging
        logging.getLogger(__name__).error("GPG decryption failed: %s", result.stderr.strip())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Decryption failed",
        )

    return Path(tmp.name), decrypted_name


async def list_snapshots(
    db: AsyncSession, user: User, repo_id: str
) -> list[BackupSnapshot]:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    return await snapshot_repo.list_by_repo(db, repo.id)


async def trigger_restore(
    db: AsyncSession, user: User, repo_id: str, body: RestoreJobCreate
) -> RestoreJob:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    snapshot = await snapshot_repo.get_by_id(db, body.snapshot_id)
    if not snapshot or snapshot.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found for this repository",
        )

    job = RestoreJob(
        repository_id=repo.id,
        snapshot_id=snapshot.id,
        triggered_by=user.id,
        restore_target_url=body.restore_target_url,
        status=JobStatus.PENDING,
    )
    await restore_job_repo.create(db, job)
    await db.commit()
    await db.refresh(job)

    try:
        celery.send_task(TASK_RUN_RESTORE, args=[str(job.id)])
    except OSError:
        # Redis connection failure — job stays in "pending"
        pass
    return job


async def list_restore_jobs(
    db: AsyncSession, user: User, repo_id: str
) -> list[RestoreJob]:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    return await restore_job_repo.list_by_repo(db, repo.id)


async def get_restore_job(
    db: AsyncSession, user: User, repo_id: str, job_id: str
) -> RestoreJob:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    job = await restore_job_repo.get_by_id(db, uuid.UUID(job_id))
    if not job or job.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restore job not found",
        )
    return job


# --- Restore Previews ---


async def trigger_restore_preview(
    db: AsyncSession, user: User, repo_id: str, body: RestorePreviewCreate
) -> RestorePreview:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    snapshot = await snapshot_repo.get_by_id(db, body.snapshot_id)
    if not snapshot or snapshot.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found for this repository",
        )

    preview = RestorePreview(
        snapshot_id=snapshot.id,
        restore_target_url=body.restore_target_url,
        triggered_by=user.id,
        status=JobStatus.PENDING,
    )
    await restore_preview_repo.create(db, preview)
    await db.commit()
    await db.refresh(preview)

    try:
        celery.send_task(TASK_RUN_RESTORE_PREVIEW, args=[str(preview.id)])
    except OSError:
        pass
    return preview


async def get_restore_preview(
    db: AsyncSession, user: User, repo_id: str, preview_id: str
) -> RestorePreview:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    preview = await restore_preview_repo.get_by_id(db, uuid.UUID(preview_id))
    if not preview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restore preview not found",
        )
    snapshot = await snapshot_repo.get_by_id(db, preview.snapshot_id)
    if not snapshot or snapshot.repository_id != repo.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restore preview not found",
        )
    return preview


async def trigger_detailed_preview(
    db: AsyncSession, user: User, repo_id: str, preview_id: str
) -> RestorePreview:
    preview = await get_restore_preview(db, user, repo_id, preview_id)

    if preview.status != JobStatus.SUCCEEDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quick preview must succeed before requesting detailed preview",
        )
    if preview.detail_status is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Detailed preview already requested",
        )

    preview.detail_status = JobStatus.PENDING
    await db.commit()
    await db.refresh(preview)

    try:
        celery.send_task(TASK_RUN_DETAILED_PREVIEW, args=[str(preview.id)])
    except OSError:
        pass
    return preview
