from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import require_roles, require_user
from app.core.database import get_db
from app.models.entities import Hostel, Notification, Payment, Product, ProductOrder, RoomBooking, User
from app.schemas.contracts import AdminUserRoleUpdateRequest

notifications_admin_router = APIRouter(prefix="/api", tags=["notifications_admin"])


@notifications_admin_router.get("/notifications")
def list_notifications(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == int(user["sub"]))
        .order_by(Notification.id.desc())
        .limit(50)
        .all()
    )
    unread_count = sum(1 for r in rows if not r.is_read)
    return {
        "unreadCount": unread_count,
        "notifications": [
            {
                "id": str(row.id),
                "title": row.title,
                "message": row.message,
                "category": row.category,
                "isRead": row.is_read,
                "link": row.link,
                "createdAt": row.created_at.isoformat() if row.created_at else "",
            }
            for row in rows
        ],
    }


@notifications_admin_router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    row = db.get(Notification, notification_id)
    if not row or row.user_id != int(user["sub"]):
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    return {"id": str(row.id), "isRead": True}


@notifications_admin_router.post("/notifications/read-all")
def mark_all_notifications_read(user: dict = Depends(require_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == int(user["sub"]), Notification.is_read == False).update(
        {"is_read": True}
    )
    db.commit()
    return {"ok": True}


@notifications_admin_router.get("/admin/overview")
def admin_overview(_admin: dict = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    paid_payments = db.query(Payment).filter(Payment.status.in_(["paid", "completed"])).all()
    total_revenue = round(sum(p.amount for p in paid_payments), 2)
    return {
        "stats": {
            "users": db.query(User).count(),
            "products": db.query(Product).count(),
            "orders": db.query(ProductOrder).count(),
            "hostels": db.query(Hostel).count(),
            "bookings": db.query(RoomBooking).count(),
            "payments": db.query(Payment).count(),
            "paidRevenue": total_revenue,
        }
    }


@notifications_admin_router.get("/admin/users")
def admin_list_users(_admin: dict = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.desc()).all()
    return {
        "users": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "phone": u.phone,
                "course": u.course,
            }
            for u in users
        ]
    }


@notifications_admin_router.patch("/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    body: AdminUserRoleUpdateRequest,
    _admin: dict = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.role = body.role
    db.commit()
    return {"user": {"id": str(target.id), "name": target.name, "email": target.email, "role": target.role}}


@notifications_admin_router.patch("/admin/hostels/{hostel_id}/verify")
def admin_toggle_hostel_verified(
    hostel_id: int,
    _admin: dict = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    hostel = db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    hostel.verified = not hostel.verified
    db.commit()
    return {"hostel": {"id": str(hostel.id), "verified": hostel.verified}}


@notifications_admin_router.patch("/admin/products/{product_id}/toggle")
def admin_toggle_product(
    product_id: int,
    _admin: dict = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = not product.is_active
    db.commit()
    return {"product": {"id": str(product.id), "isActive": product.is_active}}
