import logging
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from repositories import (
    destination_repo,
    encryption_key_repo,
    git_credential_repo,
    notification_channel_repo,
    restore_job_repo,
    snapshot_repo,
)
from services import git_service
from services.encryption import get_encryption_provider
from services.notifications import NotificationEvent, get_notification_provider
from services.git_service import extract_host
from shared.enums import ArchiveFormat, CredentialType, JobStatus
from shared.models import GitCredential

logger = logging.getLogger(__name__)


def _send_notifications(session: Session, event: NotificationEvent) -> None:
    """Best-effort: send to all matching channels, log failures."""
    channels = notification_channel_repo.get_enabled_for_event(
        session, event.event_type
    )
    for channel in channels:
        try:
            provider = get_notification_provider(channel)
            provider.send(event)
        except Exception as e:
            logger.error("Notification to '%s' failed: %s", channel.name, e)


def _resolve_credential(session: Session, url: str) -> GitCredential | None:
    """Find a matching git credential for the URL, respecting scheme/type compatibility."""
    host = extract_host(url)
    if not host:
        return None
    cred = git_credential_repo.get_by_host(session, host)
    if not cred:
        return None
    is_https = url.startswith(("https://", "http://"))
    if cred.credential_type == CredentialType.PAT and not is_https:
        return None
    if cred.credential_type == CredentialType.SSH_KEY and is_https:
        return None
    return cred


def run_restore(session: Session, restore_job_id: str) -> dict:
    """Restore a backup snapshot to a target git remote via force-mirror push."""
    restore_job = restore_job_repo.get_by_id(session, uuid.UUID(restore_job_id))
    if not restore_job:
        return {"error": "Restore job not found"}

    logger.info(
        "Starting restore job %s (snapshot=%s target=%s)",
        restore_job_id,
        restore_job.snapshot_id,
        restore_job.restore_target_url,
    )

    started_at = datetime.now(timezone.utc)
    restore_job_repo.mark_running(session, restore_job, started_at)
    session.commit()

    log_lines: list[str] = []
    try:
        snapshot = snapshot_repo.get_by_id(session, restore_job.snapshot_id)
        if not snapshot:
            raise RuntimeError("Snapshot no longer exists")

        destination = destination_repo.get_by_id(session, snapshot.destination_id)
        if not destination:
            raise RuntimeError("Destination no longer exists")

        archive_path = Path(destination.path).resolve() / snapshot.artifact_filename
        if not archive_path.is_file():
            raise RuntimeError(f"Archive file not found: {archive_path}")

        log_lines.append(f"Loaded snapshot artifact: {snapshot.artifact_filename}")
        log_lines.append(f"Format: {snapshot.archive_format.value}")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)

            # Decrypt if needed
            if snapshot.archive_format == ArchiveFormat.TAR_GZ_GPG:
                if not snapshot.encryption_key_id:
                    raise RuntimeError(
                        "Encrypted snapshot has no encryption_key_id recorded"
                    )
                enc_key = encryption_key_repo.get_by_id(
                    session, snapshot.encryption_key_id
                )
                if not enc_key:
                    raise RuntimeError(
                        "Encryption key used for this snapshot no longer exists"
                    )

                provider = get_encryption_provider(enc_key)
                tar_path = tmp_path / "archive.tar.gz"
                log_lines.append(
                    f"Decrypting archive with {enc_key.backend.value} ..."
                )
                provider.decrypt_file(archive_path, tar_path)
            else:
                tar_path = archive_path

            # Extract tarball
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            log_lines.append("Extracting archive ...")
            shutil.unpack_archive(str(tar_path), str(extract_dir), "gztar")

            # The backup task wraps the bare repo in a single subdirectory
            entries = [p for p in extract_dir.iterdir() if p.is_dir()]
            if len(entries) != 1:
                raise RuntimeError(
                    f"Unexpected archive layout: expected 1 directory, found {len(entries)}"
                )
            bare_repo = entries[0]

            credential = _resolve_credential(session, restore_job.restore_target_url)
            log_lines.append(
                f"Force-mirror pushing to {restore_job.restore_target_url} ..."
            )
            success, output = git_service.force_mirror_push(
                str(bare_repo), restore_job.restore_target_url, credential
            )
            log_lines.append(output)
            if not success:
                if "terminal prompts disabled" in output:
                    raise RuntimeError(
                        "Push failed: no push access to "
                        f"{restore_job.restore_target_url}. "
                        "Add a git credential for this host in "
                        "Settings > Git Credentials."
                    )
                raise RuntimeError(f"git push failed: {output.strip() or 'unknown error'}")

            log_lines.append("Restore complete")

        finished_at = datetime.now(timezone.utc)
        duration = int((finished_at - started_at).total_seconds())
        restore_job_repo.mark_succeeded(
            session, restore_job, finished_at, duration, "\n".join(log_lines)
        )
        logger.info("Restore job %s succeeded", restore_job_id)

    except Exception as e:
        finished_at = datetime.now(timezone.utc)
        duration = int((finished_at - started_at).total_seconds())
        log_lines.append(f"ERROR: {e}")
        restore_job_repo.mark_failed(
            session, restore_job, finished_at, duration, "\n".join(log_lines)
        )
        logger.error("Restore job %s failed: %s", restore_job_id, e)

    session.commit()

    if restore_job.status == JobStatus.FAILED:
        _send_notifications(
            session,
            NotificationEvent(
                event_type="restore_failed",
                title="Restore failed",
                repo_name=restore_job.restore_target_url.split("/")[-1].removesuffix(".git"),
                repo_url=restore_job.restore_target_url,
                message=restore_job.output_log or "Unknown error",
                timestamp=datetime.now(timezone.utc),
            ),
        )

    return {"restore_job_id": restore_job_id, "status": restore_job.status.value}
