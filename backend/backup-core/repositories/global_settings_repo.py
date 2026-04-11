from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import GlobalSettings


def get_settings(session: Session) -> GlobalSettings | None:
    result = session.execute(select(GlobalSettings).where(GlobalSettings.id == 1))
    return result.scalar_one_or_none()
