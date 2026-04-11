import logging
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from repositories import (
    backup_job_repo,
    destination_repo,
    encryption_key_repo,
    global_settings_repo,
    repository_repo,
)
from services import git_service
from services.encryption import get_encryption_provider
from shared.enums import RepoStatus

logger = logging.getLogger(__name__)


def _sanitize_name(name: str) -> str:
    """Sanitize a name for safe use as a filename."""
    # Strip path separators and parent references
    name = Path(name).name
    # Remove anything that isn't alphanumeric, dash, underscore, or dot
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "repo"


def verify_repo(session: Session, repo_id: str) -> dict:
    """Verify that a repo URL is accessible."""
    repo = repository_repo.get_by_id(session, uuid.UUID(repo_id))
    if not repo:
        return {"error": "Repository not found"}

    success, error = git_service.verify_access(repo.url)
    if success:
        repository_repo.update_status(session, repo, RepoStatus.SCHEDULED)
    else:
        repository_repo.update_status(session, repo, RepoStatus.ACCESS_ERROR, error)

    session.commit()
    logger.info("Repo %s verified: %s", repo_id, repo.status.value)
    return {"repo_id": repo_id, "status": repo.status.value}


def run_backup(session: Session, job_id: str) -> dict:
    """Clone a repo, create a tar.gz archive, save to destination."""
    job = backup_job_repo.get_by_id(session, uuid.UUID(job_id))
    if not job:
        return {"error": "Job not found"}

    repo = repository_repo.get_by_id_for_update(session, job.repository_id)
    if not repo:
        backup_job_repo.mark_failed(session, job, datetime.now(timezone.utc), None, "Repository not found")
        session.commit()
        return {"error": "Repository not found"}

    if repo.status == RepoStatus.RUNNING:
        backup_job_repo.mark_failed(session, job, datetime.now(timezone.utc), None, "Backup already in progress")
        session.commit()
        return {"error": "Backup already in progress"}

    logger.info("Starting backup job %s for repo %s", job_id, repo.url)

    destination = destination_repo.get_by_id(session, repo.destination_id)
    if not destination:
        backup_job_repo.mark_failed(session, job, datetime.now(timezone.utc), None, "Destination not found")
        session.commit()
        return {"error": "Destination not found"}

    # Validate destination path
    dest_path = Path(destination.path).resolve()
    if not dest_path.is_absolute():
        backup_job_repo.mark_failed(session, job, datetime.now(timezone.utc), None, "Invalid destination path")
        session.commit()
        return {"error": "Invalid destination path"}

    # Mark as running
    started_at = datetime.now(timezone.utc)
    backup_job_repo.mark_running(session, job, started_at)
    repository_repo.update_status(session, repo, RepoStatus.RUNNING)
    session.commit()

    log_lines: list[str] = []
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            safe_name = _sanitize_name(repo.name)
            clone_path = os.path.join(tmpdir, safe_name)

            log_lines.append(f"Cloning {repo.url} ...")
            success, output = git_service.clone_mirror(repo.url, clone_path)
            log_lines.append(output)

            if not success:
                raise RuntimeError(f"git clone failed: {output}")

            # Create tar.gz archive in temp dir (never at destination unencrypted)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            archive_name = f"{safe_name}_{timestamp}.tar.gz"
            tmp_archive = Path(tmpdir) / archive_name

            log_lines.append(f"Creating archive {archive_name} ...")
            shutil.make_archive(
                str(tmp_archive).removesuffix(".tar.gz"),
                "gztar",
                root_dir=tmpdir,
                base_dir=safe_name,
            )

            # Encrypt if enabled
            if repo.encrypt:
                settings = global_settings_repo.get_settings(session)
                if not settings or not settings.default_encryption_key_id:
                    raise RuntimeError(
                        "Encryption is enabled for this repo but no encryption key "
                        "is configured in global settings"
                    )

                enc_key = encryption_key_repo.get_by_id(
                    session, settings.default_encryption_key_id
                )
                if not enc_key:
                    raise RuntimeError("Default encryption key not found in database")

                provider = get_encryption_provider(enc_key)
                encrypted_path = Path(str(tmp_archive) + ".gpg")
                log_lines.append(
                    f"Encrypting archive with {enc_key.backend.value} ..."
                )
                provider.encrypt_file(tmp_archive, encrypted_path)
                tmp_archive.unlink()
                tmp_archive = encrypted_path
                archive_name = archive_name + ".gpg"
                log_lines.append("Encryption complete")

            # Move final file to destination
            dest_dir = dest_path
            dest_dir.mkdir(parents=True, exist_ok=True)
            final_path = dest_dir / archive_name
            shutil.move(str(tmp_archive), str(final_path))

            backup_size = final_path.stat().st_size
            log_lines.append(f"Archive saved: {backup_size} bytes")

        now = datetime.now(timezone.utc)
        duration = int((now - started_at).total_seconds())
        backup_job_repo.mark_succeeded(
            session, job, now, duration, "\n".join(log_lines), backup_size
        )
        repository_repo.update_status(session, repo, RepoStatus.BACKED_UP)
        logger.info("Backup job %s succeeded: %d bytes", job_id, backup_size)

    except Exception as e:
        now = datetime.now(timezone.utc)
        duration = int((now - started_at).total_seconds()) if started_at else None
        log_lines.append(f"ERROR: {e}")
        backup_job_repo.mark_failed(session, job, now, duration, "\n".join(log_lines))
        repository_repo.update_status(session, repo, RepoStatus.FAILED)
        logger.error("Backup job %s failed: %s", job_id, e)

    session.commit()
    return {"job_id": job_id, "status": job.status.value}
