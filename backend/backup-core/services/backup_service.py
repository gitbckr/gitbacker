import hashlib
import json
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
    snapshot_repo,
)
from services import git_service
from services.common import resolve_credential, send_notifications
from services.git_service import scrub_credentials
from services.encryption import get_encryption_provider
from services.notifications import NotificationEvent
from shared.enums import ArchiveFormat, JobStatus, RepoStatus
from shared.models import BackupSnapshot

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

    credential, cred_warning = resolve_credential(session, repo.url)
    if cred_warning:
        logger.warning("Credential mismatch for %s: %s", repo.url, cred_warning)
    success, error = git_service.verify_access(repo.url, credential)
    if not success and cred_warning:
        error = f"{error}\n\nNote: {cred_warning}"
    if success:
        repository_repo.update_status(session, repo, RepoStatus.SCHEDULED)
    else:
        repository_repo.update_status(session, repo, RepoStatus.ACCESS_ERROR, error)

    session.commit()
    logger.info("Verify [%s] — %s", repo.name, repo.status.value)

    if not success:
        send_notifications(
            session,
            NotificationEvent(
                event_type="repo_verification_failed",
                title="Repository verification failed",
                repo_name=repo.name,
                repo_url=repo.url,
                message=error or "Unknown error",
                timestamp=datetime.now(timezone.utc),
            ),
        )

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

    logger.info("Backup [%s] starting — %s", repo.name, repo.url)

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
    archive_format = ArchiveFormat.TAR_GZ
    encryption_key_id = None
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            safe_name = _sanitize_name(repo.name)
            clone_path = os.path.join(tmpdir, safe_name)

            credential, cred_warning = resolve_credential(session, repo.url)
            if cred_warning:
                log_lines.append(f"WARNING: {cred_warning}")

            # Check if anything changed since last backup
            try:
                remote_refs = git_service.list_remote_refs(repo.url, credential)
                refs_hash = hashlib.sha256(
                    json.dumps(sorted(remote_refs.items())).encode()
                ).hexdigest()
            except Exception:
                # If ls-remote fails, proceed with backup anyway
                refs_hash = None

            if refs_hash:
                last_snapshot = snapshot_repo.get_latest_by_repo(session, repo.id)
                if last_snapshot and last_snapshot.refs_hash == refs_hash:
                    log_lines.append("No changes since last backup — skipped")
                    now = datetime.now(timezone.utc)
                    duration = int((now - started_at).total_seconds())
                    backup_job_repo.mark_succeeded(
                        session, job, now, duration, "\n".join(log_lines), 0
                    )
                    repository_repo.update_status(session, repo, RepoStatus.BACKED_UP)
                    session.commit()
                    logger.info("Backup [%s] skipped — no changes", repo.name)
                    return {"job_id": job_id, "status": "skipped"}

            log_lines.append(f"Cloning {repo.url} ...")
            success, output = git_service.clone_mirror(repo.url, clone_path, credential)
            log_lines.append(scrub_credentials(output))

            if not success:
                raise RuntimeError(f"git clone failed: {scrub_credentials(output)}")

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
                # Use per-repo key if set, otherwise fall back to global default
                key_id = repo.encryption_key_id
                if not key_id:
                    settings = global_settings_repo.get_settings(session)
                    key_id = settings.default_encryption_key_id if settings else None
                if not key_id:
                    raise RuntimeError(
                        "Encryption is enabled for this repo but no encryption key "
                        "is configured (per-repo or global default)"
                    )

                enc_key = encryption_key_repo.get_by_id(
                    session, key_id
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
                archive_format = ArchiveFormat.TAR_GZ_GPG
                encryption_key_id = enc_key.id
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

        # Record snapshot — this is what the restore feature reads from.
        snapshot = BackupSnapshot(
            repository_id=repo.id,
            backup_job_id=job.id,
            destination_id=destination.id,
            artifact_filename=archive_name,
            archive_format=archive_format,
            encryption_key_id=encryption_key_id,
            refs_hash=refs_hash,
        )
        snapshot_repo.create(session, snapshot)
        logger.info(
            "Backup [%s] succeeded — %d bytes in %ds",
            repo.name, backup_size, duration,
        )

    except Exception as e:
        now = datetime.now(timezone.utc)
        duration = int((now - started_at).total_seconds()) if started_at else None
        log_lines.append(f"ERROR: {e}")
        backup_job_repo.mark_failed(session, job, now, duration, "\n".join(log_lines))
        repository_repo.update_status(session, repo, RepoStatus.FAILED)
        logger.error("Backup [%s] failed — %s", repo.name, e)

    session.commit()

    # --- Notifications (best-effort, after commit) ---
    if job.status == JobStatus.FAILED:
        send_notifications(
            session,
            NotificationEvent(
                event_type="backup_failed",
                title="Backup failed",
                repo_name=repo.name,
                repo_url=repo.url,
                message=job.output_log or "Unknown error",
                timestamp=datetime.now(timezone.utc),
            ),
        )
    elif job.status == JobStatus.SUCCEEDED:
        # Check disk space on destination
        try:
            usage = shutil.disk_usage(str(dest_path))
            free_pct = (usage.free / usage.total) * 100
            if free_pct < 10:
                send_notifications(
                    session,
                    NotificationEvent(
                        event_type="disk_space_low",
                        title="Disk space low",
                        repo_name=repo.name,
                        repo_url=repo.url,
                        message=(
                            f"Destination '{destination.alias}' has "
                            f"{free_pct:.1f}% free space "
                            f"({usage.free // (1024 ** 3)} GB remaining)"
                        ),
                        timestamp=datetime.now(timezone.utc),
                    ),
                )
        except OSError:
            pass  # Destination path may be remote / unmounted

    return {"job_id": job_id, "status": job.status.value}
