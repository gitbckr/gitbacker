"""add public_key to git_credentials

Revision ID: 122a6a3a110b
Revises: d47ddfccc2d0
Create Date: 2026-04-17 12:24:27.606793

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '122a6a3a110b'
down_revision: Union[str, Sequence[str], None] = 'd47ddfccc2d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE git_credentials
        ADD COLUMN IF NOT EXISTS public_key TEXT
    """)


def downgrade() -> None:
    op.drop_column("git_credentials", "public_key")
