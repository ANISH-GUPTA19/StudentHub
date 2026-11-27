"""student living decision engine

Revision ID: 20261122_0003
Revises: 20261122_0002
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261122_0003"
down_revision: Union[str, Sequence[str], None] = "20261122_0002"
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("feedback", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("category", sa.String(length=32), nullable=False), sa.Column("rating", sa.Integer(), nullable=False), sa.Column("comment", sa.String(length=500), nullable=False), sa.PrimaryKeyConstraint("id"))
    op.create_table("expenses", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("title", sa.String(length=120), nullable=False), sa.Column("amount", sa.Float(), nullable=False), sa.Column("category", sa.String(length=32), nullable=False), sa.PrimaryKeyConstraint("id"))
    op.create_table("support_requests", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("subject", sa.String(length=160), nullable=False), sa.Column("description", sa.String(length=1000), nullable=False), sa.Column("status", sa.String(length=32), nullable=False), sa.PrimaryKeyConstraint("id"))


def downgrade() -> None:
    op.drop_table("support_requests")
    op.drop_table("expenses")
    op.drop_table("feedback")
