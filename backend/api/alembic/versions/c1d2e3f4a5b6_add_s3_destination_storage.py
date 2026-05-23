"""add s3 destination storage

Revision ID: c1d2e3f4a5b6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-23 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    # See a1b2c3d4e5f6 for the same pattern.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE storagetype ADD VALUE IF NOT EXISTS 'S3'")

    op.add_column(
        "destinations",
        sa.Column("config_data", sa.JSON(), nullable=True),
    )
    op.add_column(
        "destinations",
        sa.Column("quota_bytes", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("destinations", "quota_bytes")
    op.drop_column("destinations", "config_data")
    # Postgres cannot remove an enum value; the 'S3' value remains.
