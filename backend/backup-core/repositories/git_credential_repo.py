from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import GitCredential


def get_by_host(session: Session, host: str) -> GitCredential | None:
    result = session.execute(
        select(GitCredential).where(GitCredential.host == host.lower())
    )
    return result.scalar_one_or_none()
