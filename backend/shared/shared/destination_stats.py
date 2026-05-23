"""Single-destination usage stats — shared between API (async) and worker (sync).

The API's `destination_repo.get_stats` does the same calculation in a batched,
async form for the dashboard. This module exposes the equivalent computation
for the worker's per-backup quota check so both sides answer "how much space
is this destination using?" with the same SQL.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .enums import JobStatus
from .models import BackupJob, Repository


def sum_destination_used_bytes(session: Session, dest_id: uuid.UUID) -> int:
    """Sum bytes of all successful backup artifacts for a destination."""
    result = session.execute(
        select(func.coalesce(func.sum(BackupJob.backup_size_bytes), 0))
        .join(Repository, Repository.id == BackupJob.repository_id)
        .where(
            Repository.destination_id == dest_id,
            BackupJob.status == JobStatus.SUCCEEDED,
        )
    )
    return int(result.scalar() or 0)
