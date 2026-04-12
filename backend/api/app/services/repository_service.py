import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from croniter import croniter
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery
from app.repositories import backup_job_repo, destination_repo, repository_repo
from app.services.settings_service import get_settings
from shared.enums import JobStatus, RepoStatus, TriggerType, UserRole
from shared.models import BackupJob, Repository, User
from shared.schemas import BackupJobRead, RepoCreate, RepoRead, RepoUpdate
from shared.task_signatures import TASK_RUN_BACKUP, TASK_VERIFY_REPO


def _repo_name_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return path.split("/")[-1] if "/" in path else path


async def _can_access_repo(db: AsyncSession, user: User, repo: Repository) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if repo.created_by == user.id:
        return True
    # Check repo_permissions table
    from app.repositories import permission_repo
    perm = await permission_repo.get_permission(db, user.id, repo.id)
    return perm is not None


async def get_repo_or_404(db: AsyncSession, repo_id: str) -> Repository:
    repo = await repository_repo.get_by_id(db, uuid.UUID(repo_id))
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo


async def check_repo_access(db: AsyncSession, user: User, repo: Repository) -> None:
    if not await _can_access_repo(db, user, repo):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _enrich_repos(db: AsyncSession, repos: list[Repository]) -> list[RepoRead]:
    if not repos:
        return []

    repo_ids = [r.id for r in repos]
    last_backup_map = await backup_job_repo.get_latest_successful_by_repo_ids(db, repo_ids)

    result: list[RepoRead] = []
    now = datetime.now(timezone.utc)
    for repo in repos:
        read = RepoRead.model_validate(repo)
        read.last_backup_at = last_backup_map.get(repo.id)

        if repo.cron_expression:
            try:
                base = read.last_backup_at or now
                cron = croniter(repo.cron_expression, base)
                read.next_backup_at = cron.get_next(datetime)
            except (ValueError, KeyError):
                read.next_backup_at = None

        result.append(read)
    return result


async def create_repositories(
    db: AsyncSession, user: User, body: RepoCreate
) -> list[RepoRead]:
    if body.destination_id:
        destination = await destination_repo.get_by_id(db, body.destination_id)
        if not destination:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination not found")
    else:
        destination = await destination_repo.get_default(db)
        if not destination:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No default destination configured. Create a destination first.",
            )

    # Check for duplicate URLs in this destination
    existing = await repository_repo.get_by_urls_and_destination(
        db, [u.strip() for u in body.urls if u.strip()], destination.id
    )
    if existing:
        existing_urls = {r.url for r in existing}
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already backed up to this destination: {', '.join(existing_urls)}",
        )

    # Fall back to global defaults when not explicitly provided
    global_settings = await get_settings(db)
    cron_expression = body.cron_expression if body.cron_expression is not None else global_settings.default_cron_expression
    encrypt = body.encrypt if body.encrypt is not None else global_settings.default_encrypt

    repos: list[Repository] = []
    for url in body.urls:
        url = url.strip()
        if not url:
            continue
        repo = Repository(
            url=url,
            name=_repo_name_from_url(url),
            status=RepoStatus.VERIFYING,
            destination_id=destination.id,
            encrypt=encrypt,
            cron_expression=cron_expression,
            created_by=user.id,
        )
        await repository_repo.create(db, repo)
        repos.append(repo)

    await db.commit()

    for repo in repos:
        await db.refresh(repo)
        try:
            celery.send_task(TASK_VERIFY_REPO, args=[str(repo.id)])
        except OSError:
            # Task dispatch failed (e.g. Redis down) — repo stays in "verifying"
            # and will need manual retry. Don't fail the whole request.
            pass

    return await _enrich_repos(db, repos)


async def list_repositories(db: AsyncSession, user: User) -> list[RepoRead]:
    if user.role == UserRole.ADMIN:
        repos = await repository_repo.list_all(db)
    else:
        repos = await repository_repo.list_for_user(db, user.id)

    return await _enrich_repos(db, repos)


async def get_repository(db: AsyncSession, user: User, repo_id: str) -> RepoRead:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    enriched = await _enrich_repos(db, [repo])
    return enriched[0]


async def update_repository(
    db: AsyncSession, user: User, repo_id: str, body: RepoUpdate
) -> RepoRead:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    await repository_repo.update(db, repo, body.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(repo)
    enriched = await _enrich_repos(db, [repo])
    return enriched[0]


async def delete_repository(db: AsyncSession, user: User, repo_id: str) -> None:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    await repository_repo.delete(db, repo)
    await db.commit()


async def trigger_backup(db: AsyncSession, user: User, repo_id: str) -> BackupJob:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)

    job = BackupJob(
        repository_id=repo.id,
        status=JobStatus.PENDING,
        trigger_type=TriggerType.MANUAL,
    )
    await backup_job_repo.create(db, job)
    await db.commit()
    await db.refresh(job)

    try:
        celery.send_task(TASK_RUN_BACKUP, args=[str(job.id)])
    except OSError:
        # Redis connection failure — job stays in "pending"
        pass
    return job


async def list_backup_jobs(
    db: AsyncSession, user: User, repo_id: str
) -> list[BackupJob]:
    repo = await get_repo_or_404(db, repo_id)
    await check_repo_access(db, user, repo)
    return await backup_job_repo.list_by_repo(db, repo.id)
