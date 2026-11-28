"""marketplace products, carts, orders, rooms, bookings, payments, notifications

Revision ID: 20261127_0007
Revises: 20261125_0006
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261127_0007"
down_revision: Union[str, Sequence[str], None] = "20261125_0006"
branch_labels: Union[str, Sequence[str], None] = None
dependencies: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users profile fields
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=False, server_default=""))
    op.add_column("users", sa.Column("course", sa.String(length=160), nullable=False, server_default=""))
    op.add_column("users", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))

    # Payments gateway tracking fields (preserving existing rows)
    op.add_column("payments", sa.Column("payment_type", sa.String(length=32), nullable=False, server_default="general"))
    op.add_column("payments", sa.Column("reference_id", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("gateway", sa.String(length=32), nullable=False, server_default="razorpay"))
    op.add_column("payments", sa.Column("gateway_order_id", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("gateway_payment_id", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("gateway_signature", sa.String(length=255), nullable=True))
    op.add_column("payments", sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"))
    op.add_column("payments", sa.Column("failure_reason", sa.String(length=500), nullable=True))
    op.add_column("payments", sa.Column("idempotency_key", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_payments_user_id", "payments", ["user_id"], unique=False)
    op.create_index("ix_payments_reference_id", "payments", ["reference_id"], unique=False)
    op.create_index("ix_payments_gateway_order_id", "payments", ["gateway_order_id"], unique=True)
    op.create_index("ix_payments_gateway_payment_id", "payments", ["gateway_payment_id"], unique=False)
    op.create_unique_constraint("uq_payments_idempotency_key", "payments", ["idempotency_key"])

    # Hostels extended detail fields (preserving existing rows)
    op.add_column("hostels", sa.Column("address", sa.String(length=300), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("location", sa.String(length=160), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("contact_name", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("contact_phone", sa.String(length=32), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("security_deposit", sa.Float(), nullable=False, server_default="0"))
    op.add_column("hostels", sa.Column("other_charges", sa.Float(), nullable=False, server_default="0"))
    op.add_column("hostels", sa.Column("room_type", sa.String(length=64), nullable=False, server_default="Shared"))
    op.add_column("hostels", sa.Column("gender_preference", sa.String(length=32), nullable=False, server_default="Any"))
    op.add_column("hostels", sa.Column("rules", sa.String(length=1000), nullable=False, server_default=""))
    op.add_column("hostels", sa.Column("capacity", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("hostels", sa.Column("occupied", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("hostels", sa.Column("total_rooms", sa.Integer(), nullable=False, server_default="4"))
    op.add_column("hostels", sa.Column("available_rooms", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("hostels", sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("hostels", sa.Column("description", sa.String(length=2000), nullable=False, server_default=""))
    op.create_index("ix_hostels_owner_id", "hostels", ["owner_id"], unique=False)

    # Product categories & products
    op.create_table(
        "product_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_product_categories_slug"),
    )
    op.create_index("ix_product_categories_slug", "product_categories", ["slug"], unique=True)

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("product_categories.id"), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="essentials"),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=False, server_default=""),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("condition", sa.String(length=64), nullable=False, server_default="New"),
        sa.Column("listing_type", sa.String(length=32), nullable=False, server_default="new_seller"),
        sa.Column("location", sa.String(length=160), nullable=False, server_default="Campus Store"),
        sa.Column("contact_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("contact_phone", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("rating", sa.Float(), nullable=False, server_default="4.5"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price >= 0", name="ck_products_price"),
        sa.CheckConstraint("stock >= 0", name="ck_products_stock"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_products_seller_id", "products", ["seller_id"], unique=False)
    op.create_index("ix_products_category", "products", ["category"], unique=False)
    op.create_index("ix_products_title", "products", ["title"], unique=False)
    op.create_index("ix_products_location", "products", ["location"], unique=False)
    op.create_index("ix_products_is_active", "products", ["is_active"], unique=False)

    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"], unique=False)

    op.create_table(
        "carts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_carts_user_id"),
    )
    op.create_index("ix_carts_user_id", "carts", ["user_id"], unique=True)

    op.create_table(
        "cart_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cart_id", sa.Integer(), sa.ForeignKey("carts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint("quantity > 0", name="ck_cart_items_quantity"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"], unique=False)
    op.create_index("ix_cart_items_product_id", "cart_items", ["product_id"], unique=False)

    op.create_table(
        "product_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_payment"),
        sa.Column("payment_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("subtotal", sa.Float(), nullable=False),
        sa.Column("delivery_fee", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("delivery_name", sa.String(length=120), nullable=False),
        sa.Column("delivery_phone", sa.String(length=32), nullable=False),
        sa.Column("delivery_address", sa.String(length=500), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_number", name="uq_product_orders_order_number"),
    )
    op.create_index("ix_product_orders_order_number", "product_orders", ["order_number"], unique=True)
    op.create_index("ix_product_orders_student_id", "product_orders", ["student_id"], unique=False)
    op.create_index("ix_product_orders_status", "product_orders", ["status"], unique=False)
    op.create_index("ix_product_orders_payment_status", "product_orders", ["payment_status"], unique=False)

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("product_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("product_title", sa.String(length=160), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Float(), nullable=False),
        sa.Column("seller_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"], unique=False)
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"], unique=False)
    op.create_index("ix_order_items_seller_id", "order_items", ["seller_id"], unique=False)

    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("room_number", sa.String(length=64), nullable=False),
        sa.Column("room_type", sa.String(length=64), nullable=False, server_default="Shared"),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("occupied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_rent", sa.Float(), nullable=False),
        sa.Column("security_deposit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("capacity > 0", name="ck_rooms_capacity"),
        sa.CheckConstraint("occupied >= 0", name="ck_rooms_occupied"),
        sa.CheckConstraint("monthly_rent >= 0", name="ck_rooms_rent"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rooms_hostel_id", "rooms", ["hostel_id"], unique=False)

    op.create_table(
        "room_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("caption", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_room_images_hostel_id", "room_images", ["hostel_id"], unique=False)

    op.create_table(
        "room_bookings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_code", sa.String(length=64), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id"), nullable=False),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id"), nullable=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("check_in_date", sa.String(length=32), nullable=False),
        sa.Column("duration_months", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("check_out_date", sa.String(length=32), nullable=False),
        sa.Column("monthly_rent", sa.Float(), nullable=False),
        sa.Column("security_deposit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("other_charges", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="Pending"),
        sa.Column("notes", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("cancellation_reason", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_code", name="uq_room_bookings_booking_code"),
    )
    op.create_index("ix_room_bookings_booking_code", "room_bookings", ["booking_code"], unique=True)
    op.create_index("ix_room_bookings_student_id", "room_bookings", ["student_id"], unique=False)
    op.create_index("ix_room_bookings_hostel_id", "room_bookings", ["hostel_id"], unique=False)
    op.create_index("ix_room_bookings_room_id", "room_bookings", ["room_id"], unique=False)
    op.create_index("ix_room_bookings_owner_id", "room_bookings", ["owner_id"], unique=False)
    op.create_index("ix_room_bookings_status", "room_bookings", ["status"], unique=False)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="system"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("link", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"], unique=False)
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"], unique=False)


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("room_bookings")
    op.drop_table("room_images")
    op.drop_table("rooms")
    op.drop_table("order_items")
    op.drop_table("product_orders")
    op.drop_table("cart_items")
    op.drop_table("carts")
    op.drop_table("product_images")
    op.drop_table("products")
    op.drop_table("product_categories")

    op.drop_index("ix_hostels_owner_id", table_name="hostels")
    for col in [
        "description", "is_available", "available_rooms", "total_rooms", "occupied",
        "capacity", "rules", "gender_preference", "room_type", "other_charges",
        "security_deposit", "contact_phone", "contact_name", "location", "address",
    ]:
        op.drop_column("hostels", col)

    op.drop_constraint("uq_payments_idempotency_key", "payments", type_="unique")
    op.drop_index("ix_payments_gateway_payment_id", table_name="payments")
    op.drop_index("ix_payments_gateway_order_id", table_name="payments")
    op.drop_index("ix_payments_reference_id", table_name="payments")
    op.drop_index("ix_payments_user_id", table_name="payments")
    for col in [
        "updated_at", "created_at", "idempotency_key", "failure_reason", "currency",
        "gateway_signature", "gateway_payment_id", "gateway_order_id", "gateway",
        "reference_id", "payment_type",
    ]:
        op.drop_column("payments", col)

    for col in ["created_at", "course", "phone"]:
        op.drop_column("users", col)
