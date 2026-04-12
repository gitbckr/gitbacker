import os
from unittest.mock import patch

from shared.enums import JobStatus, RepoStatus
from services.backup_service import verify_repo, run_backup


@patch("services.backup_service.git_service")
def test_verify_repo_success(mock_git, db_session, repository):
    mock_git.verify_access.return_value = (True, None)

    result = verify_repo(db_session, str(repository.id))

    assert result["status"] == "scheduled"
    db_session.refresh(repository)
    assert repository.status == RepoStatus.SCHEDULED


@patch("services.backup_service.git_service")
def test_verify_repo_access_error(mock_git, db_session, repository):
    mock_git.verify_access.return_value = (False, "Could not connect")

    result = verify_repo(db_session, str(repository.id))

    assert result["status"] == "access_error"
    db_session.refresh(repository)
    assert repository.status == RepoStatus.ACCESS_ERROR


@patch("services.backup_service.git_service")
def test_verify_repo_not_found(mock_git, db_session):
    result = verify_repo(db_session, "00000000-0000-0000-0000-000000000000")
    assert result.get("error") == "Repository not found"


@patch("services.backup_service.git_service")
def test_run_backup_success(mock_git, db_session, repository, backup_job, destination):
    repository.status = RepoStatus.SCHEDULED
    db_session.flush()

    def clone_side_effect(url, dest_path, credential=None):
        os.makedirs(dest_path, exist_ok=True)
        with open(os.path.join(dest_path, "HEAD"), "w") as f:
            f.write("ref: refs/heads/main\n")
        return True, "Cloned successfully"

    mock_git.clone_mirror.side_effect = clone_side_effect

    result = run_backup(db_session, str(backup_job.id))

    assert result["status"] == "succeeded"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.SUCCEEDED
    assert backup_job.backup_size_bytes > 0
    db_session.refresh(repository)
    assert repository.status == RepoStatus.BACKED_UP


@patch("services.backup_service.git_service")
def test_run_backup_clone_failure(
    mock_git, db_session, repository, backup_job, destination
):
    repository.status = RepoStatus.SCHEDULED
    db_session.flush()

    mock_git.clone_mirror.return_value = (False, "fatal: clone failed")

    result = run_backup(db_session, str(backup_job.id))

    assert result["status"] == "failed"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.FAILED
    assert "clone failed" in backup_job.output_log


@patch("services.backup_service.git_service")
def test_run_backup_job_not_found(mock_git, db_session):
    result = run_backup(db_session, "00000000-0000-0000-0000-000000000000")
    assert result.get("error") == "Job not found"


@patch("services.backup_service.git_service")
def test_run_backup_already_running(
    mock_git, db_session, repository, backup_job, destination
):
    repository.status = RepoStatus.RUNNING
    db_session.flush()

    result = run_backup(db_session, str(backup_job.id))

    assert result.get("error") == "Backup already in progress"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.FAILED


@patch("services.encryption.gpg.subprocess.run")
@patch("services.backup_service.git_service")
def test_run_backup_with_encryption(
    mock_git,
    mock_gpg_run,
    db_session,
    repository,
    backup_job,
    destination,
    global_settings_with_encryption,
):
    repository.status = RepoStatus.SCHEDULED
    repository.encrypt = True
    db_session.flush()

    def clone_side_effect(url, dest_path, credential=None):
        os.makedirs(dest_path, exist_ok=True)
        with open(os.path.join(dest_path, "HEAD"), "w") as f:
            f.write("ref: refs/heads/main\n")
        return True, "Cloned successfully"

    mock_git.clone_mirror.side_effect = clone_side_effect

    def gpg_side_effect(cmd, **kwargs):
        # Simulate GPG creating the encrypted file
        output_idx = cmd.index("--output") + 1
        output_path = cmd[output_idx]
        with open(output_path, "wb") as f:
            f.write(b"encrypted-data-placeholder")
        from unittest.mock import MagicMock
        return MagicMock(returncode=0, stderr="")

    mock_gpg_run.side_effect = gpg_side_effect

    result = run_backup(db_session, str(backup_job.id))

    assert result["status"] == "succeeded"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.SUCCEEDED
    assert backup_job.backup_size_bytes > 0
    assert "Encrypting" in backup_job.output_log
    assert "Encryption complete" in backup_job.output_log


@patch("services.backup_service.git_service")
def test_run_backup_encrypt_no_key_configured(
    mock_git, db_session, repository, backup_job, destination
):
    repository.status = RepoStatus.SCHEDULED
    repository.encrypt = True
    db_session.flush()
    # No GlobalSettings row exists, so no key is configured

    def clone_side_effect(url, dest_path, credential=None):
        os.makedirs(dest_path, exist_ok=True)
        with open(os.path.join(dest_path, "HEAD"), "w") as f:
            f.write("ref: refs/heads/main\n")
        return True, "Cloned successfully"

    mock_git.clone_mirror.side_effect = clone_side_effect

    result = run_backup(db_session, str(backup_job.id))

    assert result["status"] == "failed"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.FAILED
    assert "no encryption key" in backup_job.output_log.lower()


@patch("services.backup_service.git_service")
def test_run_backup_no_encrypt(
    mock_git, db_session, repository, backup_job, destination
):
    repository.status = RepoStatus.SCHEDULED
    repository.encrypt = False
    db_session.flush()

    def clone_side_effect(url, dest_path, credential=None):
        os.makedirs(dest_path, exist_ok=True)
        with open(os.path.join(dest_path, "HEAD"), "w") as f:
            f.write("ref: refs/heads/main\n")
        return True, "Cloned successfully"

    mock_git.clone_mirror.side_effect = clone_side_effect

    result = run_backup(db_session, str(backup_job.id))

    assert result["status"] == "succeeded"
    db_session.refresh(backup_job)
    assert backup_job.status == JobStatus.SUCCEEDED
    assert "Encrypt" not in (backup_job.output_log or "")
