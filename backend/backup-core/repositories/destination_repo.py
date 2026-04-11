import uuid

from sqlalchemy.orm import Session

from shared.models import Destination


def get_by_id(session: Session, dest_id: uuid.UUID) -> Destination | None:
    return session.get(Destination, dest_id)
