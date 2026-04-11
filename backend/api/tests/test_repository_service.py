from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.services import repository_service
from shared.enums import JobStatus, RepoStatus, TriggerType, UserRole
from shared.models import Repository, User
from shared.schemas import RepoCreate


@patch("app.services.repository_service.celery")
async def test_create_repositories_success(
    mock_celery, db_session, admin_user, default_destination
):
    body = RepoCreate(urls=["https://github.com/user/repo1"])
    repos = await repository_service.create_repositories(
        db_session, admin_user, body
    )
    assert len(repos) == 1
    assert repos[0].status == RepoStatus.VERIFYING
    assert repos[0].name == "repo1"
    mock_celery.send_task.assert_called_once()


@patch("app.services.repository_service.celery")
async def test_create_uses_default_destination(
    mock_celery, db_session, admin_user, default_destination
):
    body = RepoCreate(urls=["https://github.com/user/repo2"])
    repos = await repository_service.create_repositories(
        db_session, admin_user, body
    )
    assert repos[0].destination_id == default_destination.id


async def test_create_no_default_raises(db_session, admin_user):
    # No default destination exists
    body = RepoCreate(urls=["https://github.com/user/repo3"])
    with pytest.raises(HTTPException) as exc_info:
        await repository_service.create_repositories(
            db_session, admin_user, body
        )
    assert exc_info.value.status_code == 400


@patch("app.services.repository_service.celery")
async def test_create_duplicate_url(
    mock_celery, db_session, admin_user, default_destination
):
    # Create first repo directly
    repo = Repository(
        url="https://github.com/user/dup-repo",
        name="dup-repo",
        status=RepoStatus.VERIFYING,
        destination_id=default_destination.id,
        created_by=admin_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    # Try to create duplicate
    body = RepoCreate(urls=["https://github.com/user/dup-repo"])
    with pytest.raises(HTTPException) as exc_info:
        await repository_service.create_repositories(
            db_session, admin_user, body
        )
    assert exc_info.value.status_code == 409


@patch("app.services.repository_service.celery")
async def test_celery_failure_does_not_fail_request(
    mock_celery, db_session, admin_user, default_destination
):
    mock_celery.send_task.side_effect = OSError("Redis connection refused")
    body = RepoCreate(urls=["https://github.com/user/celery-fail"])
    repos = await repository_service.create_repositories(
        db_session, admin_user, body
    )
    assert len(repos) == 1
    assert repos[0].status == RepoStatus.VERIFYING


async def test_list_repos_admin_sees_all(
    db_session, admin_user, operator_user, default_destination
):
    for i, owner in enumerate([admin_user, operator_user]):
        repo = Repository(
            url=f"https://github.com/user/repo-{i}",
            name=f"repo-{i}",
            status=RepoStatus.SCHEDULED,
            destination_id=default_destination.id,
            created_by=owner.id,
        )
        db_session.add(repo)
    await db_session.flush()

    repos = await repository_service.list_repositories(db_session, admin_user)
    assert len(repos) == 2


async def test_list_repos_operator_sees_own(
    db_session, admin_user, operator_user, default_destination
):
    admin_repo = Repository(
        url="https://github.com/admin/private",
        name="private",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=admin_user.id,
    )
    op_repo = Repository(
        url="https://github.com/op/mine",
        name="mine",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=operator_user.id,
    )
    db_session.add_all([admin_repo, op_repo])
    await db_session.flush()

    repos = await repository_service.list_repositories(db_session, operator_user)
    assert len(repos) == 1
    assert repos[0].url == "https://github.com/op/mine"


async def test_can_access_repo_admin_bypass(
    db_session, admin_user, operator_user, default_destination
):
    repo = Repository(
        url="https://github.com/op/owned",
        name="owned",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=operator_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    # Admin can access any repo
    result = await repository_service._can_access_repo(
        db_session, admin_user, repo
    )
    assert result is True


async def test_can_access_repo_owner(
    db_session, operator_user, default_destination
):
    repo = Repository(
        url="https://github.com/op/myrepo",
        name="myrepo",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=operator_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    result = await repository_service._can_access_repo(
        db_session, operator_user, repo
    )
    assert result is True


async def test_can_access_repo_denied(
    db_session, admin_user, operator_user, default_destination
):
    repo = Repository(
        url="https://github.com/admin/secret",
        name="secret",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=admin_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    result = await repository_service._can_access_repo(
        db_session, operator_user, repo
    )
    assert result is False


@patch("app.services.repository_service.celery")
async def test_trigger_backup_creates_pending_job(
    mock_celery, db_session, admin_user, default_destination
):
    repo = Repository(
        url="https://github.com/user/trigger-test",
        name="trigger-test",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=admin_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    job = await repository_service.trigger_backup(
        db_session, admin_user, str(repo.id)
    )
    assert job.status == JobStatus.PENDING
    assert job.trigger_type == TriggerType.MANUAL
    assert job.repository_id == repo.id


async def test_delete_repo_access_denied(
    db_session, admin_user, operator_user, default_destination
):
    repo = Repository(
        url="https://github.com/admin/nodelete",
        name="nodelete",
        status=RepoStatus.SCHEDULED,
        destination_id=default_destination.id,
        created_by=admin_user.id,
    )
    db_session.add(repo)
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await repository_service.delete_repository(
            db_session, operator_user, str(repo.id)
        )
    assert exc_info.value.status_code == 403
