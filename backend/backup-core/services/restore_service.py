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
    restore_job_repo,
    restore_preview_repo,
    snapshot_repo,
)
from services import git_service
from services.common import resolve_credential, send_notifications
from services.git_service import scrub_credentials
from services.encryption import get_encryption_provider
from services.notifications import NotificationEvent
from shared.enums import ArchiveFormat, JobStatus

logger = logging.getLogger(__name__)


def run_restore(session: Session, restore_job_id: str) -> dict:
    """Restore a backup snapshot to a target git remote via force-mirror push."""
    restore_job = restore_job_repo.get_by_id(session, uuid.UUID(restore_job_id))
    if not restore_job:
        return {"error": "Restore job not found"}

    logger.info(
        "Restore starting — target=%s", restore_job.restore_target_url
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

        dest_root = Path(destination.path).resolve()
        archive_path = (dest_root / snapshot.artifact_filename).resolve()
        if not archive_path.is_relative_to(dest_root):
            raise RuntimeError("Invalid archive path")
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
            shutil.unpack_archive(str(tar_path), str(extract_dir), "gztar", filter="data")

            # The backup task wraps the bare repo in a single subdirectory
            entries = [p for p in extract_dir.iterdir() if p.is_dir()]
            if len(entries) != 1:
                raise RuntimeError(
                    f"Unexpected archive layout: expected 1 directory, found {len(entries)}"
                )
            bare_repo = entries[0]

            credential, cred_warning = resolve_credential(session, restore_job.restore_target_url)
            if cred_warning:
                log_lines.append(f"WARNING: {cred_warning}")
            log_lines.append(
                f"Force-mirror pushing to {restore_job.restore_target_url} ..."
            )
            success, output = git_service.force_mirror_push(
                str(bare_repo), restore_job.restore_target_url, credential
            )
            safe_output = scrub_credentials(output)
            log_lines.append(safe_output)
            if not success:
                if "terminal prompts disabled" in safe_output:
                    raise RuntimeError(
                        "Push failed: no push access to "
                        f"{restore_job.restore_target_url}. "
                        "Add a git credential for this host in "
                        "Settings > Git Credentials."
                    )
                raise RuntimeError(f"git push failed: {safe_output.strip() or 'unknown error'}")

            log_lines.append("Restore complete")

        finished_at = datetime.now(timezone.utc)
        duration = int((finished_at - started_at).total_seconds())
        restore_job_repo.mark_succeeded(
            session, restore_job, finished_at, duration, "\n".join(log_lines)
        )
        logger.info("Restore succeeded — %s in %ds", restore_job.restore_target_url, duration)

    except Exception as e:
        finished_at = datetime.now(timezone.utc)
        duration = int((finished_at - started_at).total_seconds())
        log_lines.append(f"ERROR: {e}")
        restore_job_repo.mark_failed(
            session, restore_job, finished_at, duration, "\n".join(log_lines)
        )
        logger.error("Restore failed — %s: %s", restore_job.restore_target_url, e)

    session.commit()

    if restore_job.status == JobStatus.FAILED:
        send_notifications(
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


# ---------------------------------------------------------------------------
# Restore preview
# ---------------------------------------------------------------------------


def _compare_refs(
    local_refs: dict[str, str], remote_refs: dict[str, str]
) -> dict:
    """Compare snapshot refs vs remote refs and return a structured diff."""
    refs: list[dict] = []
    counters = {
        "branches_created": 0,
        "branches_overwritten": 0,
        "branches_deleted": 0,
        "tags_created": 0,
        "tags_overwritten": 0,
        "tags_deleted": 0,
    }

    for ref_name in sorted(set(local_refs) | set(remote_refs)):
        if not ref_name.startswith("refs/") or "^{}" in ref_name:
            continue

        if ref_name.startswith("refs/heads/"):
            ref_type = "branch"
        elif ref_name.startswith("refs/tags/"):
            ref_type = "tag"
        else:
            continue

        local_sha = local_refs.get(ref_name)
        remote_sha = remote_refs.get(ref_name)

        if local_sha and not remote_sha:
            action = "create"
        elif not local_sha and remote_sha:
            action = "delete"
        elif local_sha != remote_sha:
            action = "overwrite"
        else:
            continue  # identical

        refs.append({
            "ref_name": ref_name,
            "ref_type": ref_type,
            "action": action,
            "snapshot_sha": local_sha,
            "remote_sha": remote_sha,
        })

        plural = "branches" if ref_type == "branch" else "tags"
        if action == "overwrite":
            key = f"{plural}_overwritten"
        elif action == "create":
            key = f"{plural}_created"
        else:
            key = f"{plural}_deleted"
        counters[key] = counters.get(key, 0) + 1

    return {**counters, "refs": refs}


def run_restore_preview(session: Session, preview_id: str) -> dict:
    """Generate a preview of what a restore would change on the target remote."""
    preview = restore_preview_repo.get_by_id(session, uuid.UUID(preview_id))
    if not preview:
        return {"error": "Restore preview not found"}

    restore_preview_repo.mark_running(session, preview)
    session.commit()

    try:
        snapshot = snapshot_repo.get_by_id(session, preview.snapshot_id)
        if not snapshot:
            raise RuntimeError("Snapshot no longer exists")

        destination = destination_repo.get_by_id(session, snapshot.destination_id)
        if not destination:
            raise RuntimeError("Destination no longer exists")

        dest_root = Path(destination.path).resolve()
        archive_path = (dest_root / snapshot.artifact_filename).resolve()
        if not archive_path.is_relative_to(dest_root):
            raise RuntimeError("Invalid archive path")
        if not archive_path.is_file():
            raise RuntimeError(f"Archive file not found: {archive_path}")

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
                provider.decrypt_file(archive_path, tar_path)
            else:
                tar_path = archive_path

            # Extract
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            shutil.unpack_archive(str(tar_path), str(extract_dir), "gztar", filter="data")

            entries = [p for p in extract_dir.iterdir() if p.is_dir()]
            if len(entries) != 1:
                raise RuntimeError(
                    f"Unexpected archive layout: expected 1 directory, "
                    f"found {len(entries)}"
                )
            bare_repo = entries[0]

            # Read refs from snapshot and remote
            local_refs = git_service.list_local_refs(str(bare_repo))
            credential, _ = resolve_credential(
                session, preview.restore_target_url
            )
            remote_refs = git_service.list_remote_refs(
                preview.restore_target_url, credential
            )

        result_data = _compare_refs(local_refs, remote_refs)

        restore_preview_repo.mark_succeeded(
            session, preview, datetime.now(timezone.utc), result_data
        )
        logger.info("Preview succeeded — %s", preview.restore_target_url)

    except Exception as e:
        restore_preview_repo.mark_failed(
            session, preview, datetime.now(timezone.utc), str(e)
        )
        logger.error("Preview failed — %s: %s", preview.restore_target_url, e)

    session.commit()
    return {"preview_id": preview_id, "status": preview.status.value}


def run_detailed_preview(session: Session, preview_id: str) -> dict:
    """Fetch the remote and compute file-level diffs for overwritten refs."""
    preview = restore_preview_repo.get_by_id(session, uuid.UUID(preview_id))
    if not preview:
        return {"error": "Restore preview not found"}

    if preview.status != JobStatus.SUCCEEDED or not preview.result_data:
        return {"error": "Quick preview must succeed before running detailed preview"}

    overwritten = [
        r for r in preview.result_data.get("refs", [])
        if r["action"] == "overwrite" and r.get("remote_sha") and r.get("snapshot_sha")
    ]
    if not overwritten:
        restore_preview_repo.mark_detail_succeeded(session, preview, {
            "refs": [], "total_files": 0, "total_insertions": 0, "total_deletions": 0,
        })
        session.commit()
        return {"preview_id": preview_id, "detail_status": "SUCCEEDED"}

    restore_preview_repo.mark_detail_running(session, preview)
    session.commit()

    try:
        snapshot = snapshot_repo.get_by_id(session, preview.snapshot_id)
        if not snapshot:
            raise RuntimeError("Snapshot no longer exists")

        destination = destination_repo.get_by_id(session, snapshot.destination_id)
        if not destination:
            raise RuntimeError("Destination no longer exists")

        dest_root = Path(destination.path).resolve()
        archive_path = (dest_root / snapshot.artifact_filename).resolve()
        if not archive_path.is_relative_to(dest_root):
            raise RuntimeError("Invalid archive path")
        if not archive_path.is_file():
            raise RuntimeError(f"Archive file not found: {archive_path}")

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
                provider.decrypt_file(archive_path, tar_path)
            else:
                tar_path = archive_path

            # Extract
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            shutil.unpack_archive(str(tar_path), str(extract_dir), "gztar", filter="data")

            entries = [p for p in extract_dir.iterdir() if p.is_dir()]
            if len(entries) != 1:
                raise RuntimeError(
                    f"Unexpected archive layout: expected 1 directory, "
                    f"found {len(entries)}"
                )
            bare_repo = str(entries[0])

            # Fetch remote objects into the bare repo
            credential, _ = resolve_credential(
                session, preview.restore_target_url
            )
            success, fetch_output = git_service.fetch_remote(
                bare_repo, preview.restore_target_url, credential
            )
            if not success:
                raise RuntimeError(f"Failed to fetch remote: {fetch_output}")

            # Diff each overwritten ref
            detail_refs: list[dict] = []
            grand_files = 0
            grand_ins = 0
            grand_dels = 0

            for ref in overwritten:
                stats = git_service.diff_numstat(
                    bare_repo, ref["remote_sha"], ref["snapshot_sha"]
                )
                files = [
                    {"path": path, "insertions": ins, "deletions": dels}
                    for ins, dels, path in stats
                ]
                total_ins = sum(s[0] for s in stats)
                total_dels = sum(s[1] for s in stats)
                detail_refs.append({
                    "ref_name": ref["ref_name"],
                    "files": files,
                    "total_files": len(files),
                    "total_insertions": total_ins,
                    "total_deletions": total_dels,
                })
                grand_files += len(files)
                grand_ins += total_ins
                grand_dels += total_dels

        detail_data = {
            "refs": detail_refs,
            "total_files": grand_files,
            "total_insertions": grand_ins,
            "total_deletions": grand_dels,
        }

        restore_preview_repo.mark_detail_succeeded(session, preview, detail_data)
        logger.info("Detailed preview succeeded — %d files across %d refs", grand_files, len(detail_refs))

    except Exception as e:
        restore_preview_repo.mark_detail_failed(session, preview, str(e))
        logger.error("Detailed preview failed — %s", e)

    session.commit()
    return {"preview_id": preview_id, "detail_status": preview.detail_status.value}
