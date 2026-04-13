import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import BackupSnapshot


def get_by_id(session: Session, snapshot_id: uuid.UUID) -> BackupSnapshot | None:
    return session.get(BackupSnapshot, snapshot_id)


def get_latest_by_repo(session: Session, repo_id: uuid.UUID) -> BackupSnapshot | None:
    result = session.execute(
        select(BackupSnapshot)
        .where(BackupSnapshot.repository_id == repo_id)
        .order_by(BackupSnapshot.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def create(session: Session, snapshot: BackupSnapshot) -> BackupSnapshot:
    session.add(snapshot)
    session.flush()
    return snapshot
