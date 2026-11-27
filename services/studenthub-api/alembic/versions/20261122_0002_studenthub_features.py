"""studenthub feature fields

Revision ID: 20261122_0002
Revises: 20261122_0001
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261122_0002"
down_revision: Union[str, Sequence[str], None] = "20261122_0001"
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hostels", sa.Column("amenities", sa.String(length=500), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("purpose", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_column("hostels", "image_url")
    op.drop_column("hostels", "amenities")
