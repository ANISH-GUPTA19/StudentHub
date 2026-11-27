"""roommate groups and preferences

Revision ID: 20261122_0004
Revises: 20261122_0003
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261122_0004"
down_revision: Union[str, Sequence[str], None] = "20261122_0003"
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("roommate_profiles", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("course", sa.String(length=160), nullable=False), sa.Column("budget", sa.Integer(), nullable=False), sa.Column("sleep", sa.String(length=64), nullable=False), sa.Column("study", sa.String(length=64), nullable=False), sa.Column("diet", sa.String(length=64), nullable=False), sa.Column("hobbies", sa.String(length=500), nullable=False), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", name="uq_roommate_profiles_user"))
    op.create_index(op.f("ix_roommate_profiles_user_id"), "roommate_profiles", ["user_id"], unique=True)
    op.create_table("roommate_groups", sa.Column("id", sa.Integer(), nullable=False), sa.Column("owner_user_id", sa.Integer(), nullable=False), sa.Column("name", sa.String(length=160), nullable=False), sa.Column("area", sa.String(length=160), nullable=False), sa.Column("budget", sa.Integer(), nullable=False), sa.Column("member_ids", sa.String(length=500), nullable=False), sa.PrimaryKeyConstraint("id"))


def downgrade() -> None:
    op.drop_table("roommate_groups")
    op.drop_index(op.f("ix_roommate_profiles_user_id"), table_name="roommate_profiles")
    op.drop_table("roommate_profiles")
