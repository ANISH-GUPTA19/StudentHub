"""add room owner ownership

Revision ID: 20261125_0006
Revises: 20261125_0005
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261125_0006"
down_revision: Union[str, Sequence[str], None] = "20261125_0005"
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hostels", sa.Column("owner_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("hostels", "owner_id")
