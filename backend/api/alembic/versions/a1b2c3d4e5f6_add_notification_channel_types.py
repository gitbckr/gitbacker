"""add notification channel types for apprise integration

Revision ID: a1b2c3d4e5f6
Revises: 122a6a3a110b
Create Date: 2026-04-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "122a6a3a110b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
# PostgreSQL < 12. Alembic wraps migrations in a transaction by default,
# so we pop out via autocommit_block().
_NEW_VALUES = ("DISCORD", "EMAIL", "WEBHOOK", "APPRISE_URL")


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in _NEW_VALUES:
            op.execute(
                f"ALTER TYPE notificationchanneltype ADD VALUE IF NOT EXISTS '{value}'"
            )


def downgrade() -> None:
    # Postgres does not support removing enum values. A true downgrade would
    # require creating a new enum type, migrating the column, and dropping
    # the old type. Intentional no-op: forward-only migration.
    pass
