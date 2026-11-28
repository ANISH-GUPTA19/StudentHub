import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import require_roles, require_user
from app.core.database import get_db
from app.models.entities import Cart, CartItem, OrderItem, Payment, Product, ProductCategory, ProductImage, ProductOrder, User
from app.schemas.contracts import (
    CartItemAddRequest,
    CartItemUpdateRequest,
    OrderCancelRequest,
    OrderCreateRequest,
    OrderItemStatusUpdateRequest,
    ProductCreateRequest,
    ProductStatusUpdateRequest,
    ProductStockUpdateRequest,
    ProductUpdateRequest,
)
from app.services.seed import create_notification

marketplace_router = APIRouter(prefix="/api", tags=["marketplace"])


def _serialize_product(product: Product) -> dict:
    gallery = [img.image_url for img in sorted(product.images, key=lambda x: x.sort_order)]
    if product.image_url and product.image_url not in gallery:
        gallery.insert(0, product.image_url)
    primary_image = product.image_url or (gallery[0] if gallery else None)
    return {
        "id": str(product.id),
        "sellerId": str(product.seller_id),
        "title": product.title,
        "description": product.description,
        "seller": product.contact_name or (product.seller.name if product.seller else "Campus Seller"),
        "contactName": product.contact_name or (product.seller.name if product.seller else "Campus Seller"),
        "contactPhone": product.contact_phone,
        "price": product.price,
        "stock": product.stock,
        "inStock": product.is_active and product.stock > 0,
        "isActive": product.is_active,
        "condition": product.condition,
        "rating": product.rating,
        "listingType": product.listing_type,
        "category": product.category,
        "location": product.location,
        "image": primary_image,
        "images": gallery,
    }


def _get_or_create_cart(db: Session, user_id: int) -> Cart:
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _serialize_cart(cart: Cart) -> dict:
    items = []
    subtotal = 0.0
    for item in cart.items:
        product = item.product
        if not product:
            continue
        line_total = round(product.price * item.quantity, 2)
        subtotal += line_total
        items.append(
            {
                "id": str(item.id),
                "productId": str(product.id),
                "title": product.title,
                "price": product.price,
                "quantity": item.quantity,
                "lineTotal": line_total,
                "stock": product.stock,
                "isActive": product.is_active,
                "available": product.is_active and product.stock >= item.quantity,
                "image": product.image_url,
                "seller": product.contact_name or "Seller",
                "location": product.location,
            }
        )
    subtotal = round(subtotal, 2)
    delivery_fee = 0.0
    total_amount = round(subtotal + delivery_fee, 2)
    return {
        "id": str(cart.id),
        "items": items,
        "itemCount": sum(i["quantity"] for i in items),
        "subtotal": subtotal,
        "deliveryFee": delivery_fee,
        "totalAmount": total_amount,
    }


def _serialize_order(order: ProductOrder, db: Session | None = None) -> dict:
    payment = None
    if db is not None:
        payment = (
            db.query(Payment)
            .filter(Payment.payment_type == "order", Payment.reference_id == order.id)
            .order_by(Payment.id.desc())
            .first()
        )
    return {
        "id": str(order.id),
        "orderNumber": order.order_number,
        "studentId": str(order.student_id),
        "status": order.status,
        "paymentStatus": order.payment_status,
        "subtotal": order.subtotal,
        "deliveryFee": order.delivery_fee,
        "totalAmount": order.total_amount,
        "deliveryName": order.delivery_name,
        "deliveryPhone": order.delivery_phone,
        "deliveryAddress": order.delivery_address,
        "notes": order.notes,
        "createdAt": order.created_at.isoformat() if order.created_at else "",
        "payment": {
            "id": str(payment.id),
            "status": payment.status,
            "gateway": payment.gateway,
            "gatewayOrderId": payment.gateway_order_id,
            "gatewayPaymentId": payment.gateway_payment_id,
        }
        if payment
        else None,
        "items": [
            {
                "id": str(item.id),
                "productId": str(item.product_id),
                "sellerId": str(item.seller_id),
                "productTitle": item.product_title,
                "unitPrice": item.unit_price,
                "quantity": item.quantity,
                "lineTotal": item.line_total,
                "sellerStatus": item.seller_status,
                "image": item.product.image_url if item.product else None,
            }
            for item in order.items
        ],
    }


@marketplace_router.get("/products")
def list_products(
    search: str | None = None,
    category: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    location: str | None = None,
    in_stock_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.is_active == True)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(Product.title.ilike(term) | Product.description.ilike(term) | Product.contact_name.ilike(term))
    if category and category != "all":
        query = query.filter(Product.category == category.strip().lower())
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if location:
        query = query.filter(Product.location.ilike(f"%{location.strip()}%"))
    if in_stock_only:
        query = query.filter(Product.stock > 0)
    rows = query.order_by(Product.id.desc()).all()
    return {"products": [_serialize_product(row) for row in rows], "total": len(rows)}


@marketplace_router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"product": _serialize_product(product)}


@marketplace_router.post("/products", status_code=201)
def create_product(
    body: ProductCreateRequest,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    slug = body.category.strip().lower()
    cat = db.query(ProductCategory).filter(ProductCategory.slug == slug).first()
    if not cat:
        cat = ProductCategory(slug=slug, name=slug.replace("_", " ").title())
        db.add(cat)
        db.commit()
        db.refresh(cat)

    images = [u.strip() for u in body.imageUrls if u.strip()]
    primary_img = body.imageUrl or (images[0] if images else None)
    if primary_img and primary_img not in images:
        images.insert(0, primary_img)

    product = Product(
        seller_id=int(user["sub"]),
        category_id=cat.id,
        category=slug,
        title=body.title.strip(),
        description=body.description.strip(),
        price=round(body.price, 2),
        stock=body.stock,
        condition=body.condition.strip(),
        listing_type=body.listingType,
        location=body.location.strip() or "Campus Store",
        contact_name=body.contactName.strip(),
        contact_phone=body.contactPhone.strip(),
        image_url=primary_img,
        is_active=True,
        rating=4.5,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    for idx, url in enumerate(images):
        db.add(ProductImage(product_id=product.id, image_url=url, sort_order=idx))
    db.commit()
    db.refresh(product)
    return {"product": _serialize_product(product)}


@marketplace_router.put("/products/{product_id}")
def update_product(
    product_id: int,
    body: ProductUpdateRequest,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own products")

    if body.title is not None:
        product.title = body.title.strip()
    if body.description is not None:
        product.description = body.description.strip()
    if body.price is not None:
        product.price = round(body.price, 2)
    if body.stock is not None:
        product.stock = body.stock
    if body.category is not None:
        product.category = body.category.strip().lower()
    if body.condition is not None:
        product.condition = body.condition.strip()
    if body.location is not None:
        product.location = body.location.strip()
    if body.contactName is not None:
        product.contact_name = body.contactName.strip()
    if body.contactPhone is not None:
        product.contact_phone = body.contactPhone.strip()
    if body.isActive is not None:
        product.is_active = body.isActive
    if body.imageUrl is not None:
        product.image_url = body.imageUrl
    if body.imageUrls is not None:
        db.query(ProductImage).filter(ProductImage.product_id == product.id).delete()
        cleaned = [u.strip() for u in body.imageUrls if u.strip()]
        if cleaned and not product.image_url:
            product.image_url = cleaned[0]
        for idx, url in enumerate(cleaned):
            db.add(ProductImage(product_id=product.id, image_url=url, sort_order=idx))

    db.commit()
    db.refresh(product)
    return {"product": _serialize_product(product)}


@marketplace_router.patch("/products/{product_id}/stock")
def update_product_stock(
    product_id: int,
    body: ProductStockUpdateRequest,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only update stock for your own products")
    product.stock = body.stock
    db.commit()
    db.refresh(product)
    return {"product": _serialize_product(product)}


@marketplace_router.patch("/products/{product_id}/status")
def toggle_product_status(
    product_id: int,
    body: ProductStatusUpdateRequest,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only update your own products")
    product.is_active = body.isActive
    db.commit()
    db.refresh(product)
    return {"product": _serialize_product(product)}


@marketplace_router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    has_orders = db.query(OrderItem).filter(OrderItem.product_id == product.id).first() is not None
    if has_orders:
        product.is_active = False
        db.commit()
        return {"deleted": False, "deactivated": True, "message": "Product has existing orders and was deactivated"}

    db.query(CartItem).filter(CartItem.product_id == product.id).delete()
    db.delete(product)
    db.commit()
    return {"deleted": True, "deactivated": False}


@marketplace_router.get("/seller/products")
def seller_products(user: dict = Depends(require_roles("seller", "admin")), db: Session = Depends(get_db)):
    query = db.query(Product)
    if user["role"] != "admin":
        query = query.filter(Product.seller_id == int(user["sub"]))
    rows = query.order_by(Product.id.desc()).all()
    return {"products": [_serialize_product(row) for row in rows]}


@marketplace_router.get("/seller/orders")
def seller_orders(user: dict = Depends(require_roles("seller", "admin")), db: Session = Depends(get_db)):
    query = db.query(OrderItem)
    if user["role"] != "admin":
        query = query.filter(OrderItem.seller_id == int(user["sub"]))
    items = query.order_by(OrderItem.id.desc()).all()

    result = []
    total_revenue = 0.0
    pending_count = 0
    completed_count = 0
    units_sold = 0
    for item in items:
        order = item.order
        if not order:
            continue
        if order.payment_status == "paid" and item.seller_status != "rejected" and order.status != "cancelled":
            total_revenue += item.line_total
            units_sold += item.quantity
        if item.seller_status == "pending":
            pending_count += 1
        elif item.seller_status in {"accepted", "packed", "shipped", "delivered"}:
            completed_count += 1
        result.append(
            {
                "id": str(item.id),
                "orderId": str(order.id),
                "orderNumber": order.order_number,
                "productId": str(item.product_id),
                "productTitle": item.product_title,
                "unitPrice": item.unit_price,
                "quantity": item.quantity,
                "lineTotal": item.line_total,
                "sellerStatus": item.seller_status,
                "orderStatus": order.status,
                "paymentStatus": order.payment_status,
                "deliveryName": order.delivery_name,
                "deliveryPhone": order.delivery_phone,
                "deliveryAddress": order.delivery_address,
                "createdAt": order.created_at.isoformat() if order.created_at else "",
            }
        )
    return {
        "orders": result,
        "summary": {
            "totalRevenue": round(total_revenue, 2),
            "pendingOrders": pending_count,
            "processedOrders": completed_count,
            "unitsSold": units_sold,
        },
    }


@marketplace_router.patch("/seller/orders/{order_item_id}")
def update_seller_order_status(
    order_item_id: int,
    body: OrderItemStatusUpdateRequest,
    user: dict = Depends(require_roles("seller", "admin")),
    db: Session = Depends(get_db),
):
    item = db.get(OrderItem, order_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    if item.seller_id != int(user["sub"]) and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only manage orders for your own products")

    order = item.order
    if not order:
        raise HTTPException(status_code=404, detail="Parent order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled orders cannot be updated")

    if body.sellerStatus in {"accepted", "packed", "shipped", "delivered"}:
        if order.payment_status != "paid":
            # Validate stock availability before accepting unpaid order
            product = db.get(Product, item.product_id)
            if not product or not product.is_active or product.stock < item.quantity:
                raise HTTPException(status_code=409, detail=f"Insufficient stock for {item.product_title}")

    if body.sellerStatus == "rejected" and order.payment_status == "paid" and item.seller_status != "rejected":
        # Restore stock if rejecting an already-paid item
        product = db.get(Product, item.product_id)
        if product:
            product.stock += item.quantity

    item.seller_status = body.sellerStatus
    # Sync aggregate order status cleanly
    sibling_statuses = {sibling.seller_status for sibling in order.items}
    if all(s == "rejected" for s in sibling_statuses):
        order.status = "rejected"
    elif all(s == "delivered" for s in sibling_statuses):
        order.status = "delivered"
    elif any(s == "shipped" for s in sibling_statuses):
        order.status = "shipped"
    elif any(s == "packed" for s in sibling_statuses):
        order.status = "packed"
    elif any(s == "accepted" for s in sibling_statuses):
        order.status = "accepted"
    order.updated_at = datetime.now(timezone.utc)

    create_notification(
        db,
        order.student_id,
        f"Order {order.order_number} updated",
        f"{item.product_title} is now marked as {body.sellerStatus}.",
        category="order",
        link="/marketplace",
    )
    db.commit()
    return {"item": {"id": str(item.id), "sellerStatus": item.seller_status, "orderStatus": order.status}}


@marketplace_router.get("/cart")
def get_cart(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    cart = _get_or_create_cart(db, int(user["sub"]))
    return {"cart": _serialize_cart(cart)}


@marketplace_router.post("/cart/items", status_code=201)
def add_to_cart(
    body: CartItemAddRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, body.productId)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product is unavailable")
    if product.stock <= 0:
        raise HTTPException(status_code=409, detail="Product is out of stock")

    cart = _get_or_create_cart(db, int(user["sub"]))
    existing = db.query(CartItem).filter(CartItem.cart_id == cart.id, CartItem.product_id == product.id).first()
    new_qty = (existing.quantity if existing else 0) + body.quantity
    if new_qty > product.stock:
        raise HTTPException(status_code=409, detail=f"Only {product.stock} unit(s) of {product.title} are in stock")

    if existing:
        existing.quantity = new_qty
    else:
        db.add(CartItem(cart_id=cart.id, product_id=product.id, quantity=body.quantity))
    cart.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cart)
    return {"cart": _serialize_cart(cart)}


@marketplace_router.patch("/cart/items/{item_id}")
def update_cart_item(
    item_id: int,
    body: CartItemUpdateRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    cart = _get_or_create_cart(db, int(user["sub"]))
    item = db.get(CartItem, item_id)
    if not item or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Cart item not found")
    product = db.get(Product, item.product_id)
    if not product or not product.is_active or product.stock <= 0:
        raise HTTPException(status_code=409, detail="Product is no longer available")
    if body.quantity > product.stock:
        raise HTTPException(status_code=409, detail=f"Only {product.stock} unit(s) available")
    item.quantity = body.quantity
    cart.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cart)
    return {"cart": _serialize_cart(cart)}


@marketplace_router.delete("/cart/items/{item_id}")
def remove_cart_item(
    item_id: int,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    cart = _get_or_create_cart(db, int(user["sub"]))
    item = db.get(CartItem, item_id)
    if not item or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    cart.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cart)
    return {"cart": _serialize_cart(cart)}


@marketplace_router.delete("/cart")
def clear_cart(user: dict = Depends(require_roles("student")), db: Session = Depends(get_db)):
    cart = _get_or_create_cart(db, int(user["sub"]))
    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete()
    db.commit()
    db.refresh(cart)
    return {"cart": _serialize_cart(cart)}


@marketplace_router.post("/orders", status_code=201)
def create_order(
    body: OrderCreateRequest,
    user: dict = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(user["sub"])
    if body.idempotencyKey:
        existing_order = (
            db.query(ProductOrder)
            .filter(ProductOrder.student_id == student_id, ProductOrder.notes.contains(f"[idem:{body.idempotencyKey}]"))
            .first()
        )
        if existing_order:
            return {"order": _serialize_order(existing_order, db)}

    cart = _get_or_create_cart(db, student_id)
    if not cart.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")

    subtotal = 0.0
    order_items_data: list[tuple[Product, int, float]] = []
    for item in cart.items:
        product = db.get(Product, item.product_id)
        if not product or not product.is_active:
            raise HTTPException(status_code=409, detail=f"Product '{item.product.title if item.product else item.product_id}' is unavailable")
        if product.stock < item.quantity:
            raise HTTPException(status_code=409, detail=f"Insufficient stock for {product.title} ({product.stock} left)")
        line_total = round(product.price * item.quantity, 2)
        subtotal += line_total
        order_items_data.append((product, item.quantity, line_total))

    subtotal = round(subtotal, 2)
    delivery_fee = 0.0
    total_amount = round(subtotal + delivery_fee, 2)
    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    notes = body.notes.strip()
    if body.idempotencyKey:
        notes = f"{notes} [idem:{body.idempotencyKey}]".strip()

    order = ProductOrder(
        order_number=order_number,
        student_id=student_id,
        status="pending_payment",
        payment_status="pending",
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        total_amount=total_amount,
        delivery_name=body.deliveryName.strip(),
        delivery_phone=body.deliveryPhone.strip(),
        delivery_address=body.deliveryAddress.strip(),
        notes=notes,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    notified_sellers: set[int] = set()
    for product, qty, line_total in order_items_data:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                seller_id=product.seller_id,
                product_title=product.title,
                unit_price=product.price,
                quantity=qty,
                line_total=line_total,
                seller_status="pending",
            )
        )
        if product.seller_id not in notified_sellers:
            create_notification(
                db,
                product.seller_id,
                f"New order {order.order_number}",
                f"{body.deliveryName.strip()} placed an order including {product.title} (x{qty}).",
                category="order",
                link="/owner",
            )
            notified_sellers.add(product.seller_id)

    create_notification(
        db,
        student_id,
        f"Order {order.order_number} created",
        "Complete payment to confirm your order and reserve stock.",
        category="order",
        link="/marketplace",
    )
    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete()
    db.commit()
    db.refresh(order)
    return {"order": _serialize_order(order, db)}


@marketplace_router.get("/orders")
def list_orders(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    query = db.query(ProductOrder)
    if user["role"] != "admin":
        query = query.filter(ProductOrder.student_id == int(user["sub"]))
    orders = query.order_by(ProductOrder.id.desc()).all()
    return {"orders": [_serialize_order(order, db) for order in orders]}


@marketplace_router.get("/orders/{order_id}")
def get_order(order_id: int, user: dict = Depends(require_user), db: Session = Depends(get_db)):
    order = db.get(ProductOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    user_id = int(user["sub"])
    seller_ids = {item.seller_id for item in order.items}
    if user["role"] != "admin" and order.student_id != user_id and user_id not in seller_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return {"order": _serialize_order(order, db)}


@marketplace_router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: int,
    body: OrderCancelRequest,
    user: dict = Depends(require_roles("student", "admin")),
    db: Session = Depends(get_db),
):
    order = db.get(ProductOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] != "admin" and order.student_id != int(user["sub"]):
        raise HTTPException(status_code=403, detail="You can only cancel your own orders")
    if order.status in {"shipped", "delivered", "cancelled", "rejected"}:
        raise HTTPException(status_code=409, detail=f"Orders with status '{order.status}' cannot be cancelled")

    if order.payment_status == "paid":
        for item in order.items:
            if item.seller_status != "rejected":
                product = db.get(Product, item.product_id)
                if product:
                    product.stock += item.quantity

    order.status = "cancelled"
    order.notes = f"{order.notes}\nCancel reason: {body.reason.strip()}".strip()
    order.updated_at = datetime.now(timezone.utc)
    create_notification(
        db,
        order.student_id,
        f"Order {order.order_number} cancelled",
        body.reason.strip(),
        category="order",
        link="/marketplace",
    )
    db.commit()
    db.refresh(order)
    return {"order": _serialize_order(order, db)}
