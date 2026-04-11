from sqlalchemy.ext.asyncio import AsyncSession

from shared.enums import UserRole
from shared.models import User
from shared.schemas import DailyActivitySummary

from app.repositories import backup_job_repo, repository_repo


async def get_backup_activity(
    db: AsyncSession,
    user: User,
    days: int = 365,
) -> list[DailyActivitySummary]:
    repo_ids: list | None = None
    if user.role != UserRole.ADMIN:
        repos = await repository_repo.list_for_user(db, user.id)
        repo_ids = [r.id for r in repos]

    rows = await backup_job_repo.get_daily_activity(db, days=days, repo_ids=repo_ids)
    return [
        DailyActivitySummary(date=date, succeeded=s, failed=f, total=t)
        for date, s, f, t in rows
    ]
