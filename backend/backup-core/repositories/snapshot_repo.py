import uuid

from sqlalchemy.orm import Session

from shared.models import BackupSnapshot


def get_by_id(session: Session, snapshot_id: uuid.UUID) -> BackupSnapshot | None:
    return session.get(BackupSnapshot, snapshot_id)


def create(session: Session, snapshot: BackupSnapshot) -> BackupSnapshot:
    session.add(snapshot)
    session.flush()
    return snapshot
