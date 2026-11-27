"""initial schema

Revision ID: 20261122_0001
Revises:
Create Date: 2026-11-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261122_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.CheckConstraint(
            "role IN ('student', 'hostel_owner', 'mess_owner', 'seller', 'admin')",
            name="ck_users_role",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    op.create_table(
        "hostels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("area", sa.String(length=160), nullable=False),
        sa.Column("rent", sa.Float(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.CheckConstraint("rating >= 0 AND rating <= 5", name="ck_hostels_rating"),
        sa.CheckConstraint("rent >= 0", name="ck_hostels_rent"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hostels_area"), "hostels", ["area"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hostels_area"), table_name="hostels")
    op.drop_table("hostels")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
