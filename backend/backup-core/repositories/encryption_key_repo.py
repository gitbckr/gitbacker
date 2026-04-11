import uuid

from sqlalchemy.orm import Session

from shared.models import EncryptionKey


def get_by_id(session: Session, key_id: uuid.UUID) -> EncryptionKey | None:
    return session.get(EncryptionKey, key_id)
