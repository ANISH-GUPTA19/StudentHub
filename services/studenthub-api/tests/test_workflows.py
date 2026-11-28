import hashlib
import hmac
import json
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.auth import hash_password
from app.core.database import Base, get_db
from app.main import app
from app.models.entities import Hostel, User
from app.services.seed import ensure_seed_data


@pytest.fixture()
def isolated_client(tmp_path):
    db_file = tmp_path / "test_studenthub.db"
    test_engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)

    with TestingSessionLocal() as db:
        ensure_seed_data(db)
        db.add(
            User(
                name="Platform Admin",
                email="admin@studenthub.test",
                password_hash=hash_password("AdminPass123!"),
                role="admin",
            )
        )
        db.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient, name: str, email: str, role: str, password: str = "Secret123!") -> tuple[dict, str]:
    res = client.post("/api/auth/register", json={"name": name, "email": email, "password": password, "role": role})
    assert res.status_code == 201, res.text
    body = res.json()
    return body["user"], body["session"]["token"]


def _login(client: TestClient, email: str, password: str) -> tuple[dict, str]:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    body = res.json()
    return body["user"], body["session"]["token"]


def _sign_rzp(secret: str, order_id: str, payment_id: str) -> str:
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def test_role_authorization_and_profile(isolated_client):
    client, _ = isolated_client
    _, student_token = _register(client, "Aarav Student", "aarav@test.edu", "student")
    _, seller_token = _register(client, "Riya Seller", "riya@test.edu", "seller")

    # Student cannot create products or access owner/admin dashboards
    assert client.post(
        "/api/products",
        headers=_auth_headers(student_token),
        json={"title": "Lamp", "price": 500, "stock": 3, "category": "essentials", "condition": "New", "contactName": "Aarav"},
    ).status_code == 403
    assert client.get("/api/owner/dashboard", headers=_auth_headers(student_token)).status_code == 403
    assert client.get("/api/admin/overview", headers=_auth_headers(student_token)).status_code == 403

    # Negative price or stock fails validation
    assert client.post(
        "/api/products",
        headers=_auth_headers(seller_token),
        json={"title": "Bad Item", "price": -10, "stock": 3, "category": "essentials", "condition": "New", "contactName": "Riya"},
    ).status_code == 422

    # Profile update works
    upd = client.put("/api/auth/me", headers=_auth_headers(student_token), json={"name": "Aarav K.", "phone": "9999999999", "course": "CSE"})
    assert upd.status_code == 200
    assert upd.json()["user"]["course"] == "CSE"


def test_marketplace_end_to_end_with_verified_payment_and_stock(isolated_client, monkeypatch):
    client, _ = isolated_client
    _, seller_a = _register(client, "Seller One", "seller1@test.edu", "seller")
    _, seller_b = _register(client, "Seller Two", "seller2@test.edu", "seller")
    _, student_token = _register(client, "Anish Student", "anish@test.edu", "student")

    # Seller A creates product
    created = client.post(
        "/api/products",
        headers=_auth_headers(seller_a),
        json={
            "title": "Ergonomic Study Chair",
            "description": "Mesh back study chair",
            "price": 3200,
            "stock": 2,
            "category": "furniture",
            "condition": "New",
            "location": "North Campus",
            "contactName": "Seller One",
            "contactPhone": "9876500001",
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()["product"]
    product_id = int(product["id"])

    # Seller B cannot modify Seller A's product
    assert client.put(
        f"/api/products/{product_id}",
        headers=_auth_headers(seller_b),
        json={"title": "Hacked"},
    ).status_code == 403

    # Student searches & filters product
    search_res = client.get("/api/products?search=Ergonomic&category=furniture&in_stock_only=true")
    assert search_res.status_code == 200
    assert any(p["id"] == product["id"] for p in search_res.json()["products"])

    # Student adds to cart, checks stock guard
    assert client.post("/api/cart/items", headers=_auth_headers(student_token), json={"productId": product_id, "quantity": 5}).status_code == 409
    cart_res = client.post("/api/cart/items", headers=_auth_headers(student_token), json={"productId": product_id, "quantity": 2})
    assert cart_res.status_code == 201
    assert cart_res.json()["cart"]["totalAmount"] == 6400.0

    # Student places order
    order_res = client.post(
        "/api/orders",
        headers=_auth_headers(student_token),
        json={
            "deliveryName": "Anish",
            "deliveryPhone": "9876543210",
            "deliveryAddress": "Hostel B, Room 204",
            "idempotencyKey": "order-idem-1",
        },
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()["order"]
    assert order["status"] == "pending_payment"
    assert order["paymentStatus"] == "pending"

    # Without Razorpay credentials, order stays pending and stock is NOT deducted
    unconf = client.post(
        "/api/payments/create-order",
        headers=_auth_headers(student_token),
        json={"paymentType": "order", "referenceId": int(order["id"])},
    )
    assert unconf.status_code == 201
    assert unconf.json()["gatewayConfigured"] is False
    assert unconf.json()["payment"]["status"] == "pending"
    assert client.get(f"/api/products/{product_id}").json()["product"]["stock"] == 2

    # Now configure Razorpay test credentials and mock Razorpay order API
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_123456")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "test_secret_key_789")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "test_webhook_secret_456")

    with patch("app.api.payments.create_razorpay_order", return_value={"id": "order_rzp_001", "amount": 640000, "currency": "INR"}):
        pay_order_res = client.post(
            "/api/payments/create-order",
            headers=_auth_headers(student_token),
            json={"paymentType": "order", "referenceId": int(order["id"])},
        )
        assert pay_order_res.status_code == 201
        pay_data = pay_order_res.json()
        assert pay_data["gatewayConfigured"] is True
        payment_id = int(pay_data["payment"]["id"])

    # Invalid signature must fail & NOT mark order paid
    bad_verify = client.post(
        "/api/payments/verify",
        headers=_auth_headers(student_token),
        json={
            "paymentId": payment_id,
            "gatewayOrderId": "order_rzp_001",
            "gatewayPaymentId": "pay_rzp_999",
            "gatewaySignature": "0" * 64,
        },
    )
    assert bad_verify.status_code == 400
    assert client.get(f"/api/products/{product_id}").json()["product"]["stock"] == 2

    # Valid signature verifies payment, marks order paid, and deducts stock safely
    valid_sig = _sign_rzp("test_secret_key_789", "order_rzp_001", "pay_rzp_999")
    ok_verify = client.post(
        "/api/payments/verify",
        headers=_auth_headers(student_token),
        json={
            "paymentId": payment_id,
            "gatewayOrderId": "order_rzp_001",
            "gatewayPaymentId": "pay_rzp_999",
            "gatewaySignature": valid_sig,
        },
    )
    assert ok_verify.status_code == 200, ok_verify.text
    assert ok_verify.json()["payment"]["status"] == "paid"
    assert client.get(f"/api/products/{product_id}").json()["product"]["stock"] == 0

    # Idempotent re-verification does not double-deduct or fail
    again = client.post(
        "/api/payments/verify",
        headers=_auth_headers(student_token),
        json={
            "paymentId": payment_id,
            "gatewayOrderId": "order_rzp_001",
            "gatewayPaymentId": "pay_rzp_999",
            "gatewaySignature": valid_sig,
        },
    )
    assert again.status_code == 200
    assert again.json()["alreadyVerified"] is True

    # Out-of-stock purchase is prevented
    assert client.post("/api/cart/items", headers=_auth_headers(student_token), json={"productId": product_id, "quantity": 1}).status_code == 409

    # Seller views incoming orders & fulfills
    seller_orders = client.get("/api/seller/orders", headers=_auth_headers(seller_a)).json()["orders"]
    assert len(seller_orders) == 1
    item_id = seller_orders[0]["id"]
    for st in ("accepted", "packed", "shipped", "delivered"):
        upd = client.patch(f"/api/seller/orders/{item_id}", headers=_auth_headers(seller_a), json={"sellerStatus": st})
        assert upd.status_code == 200
    assert client.get("/api/orders", headers=_auth_headers(student_token)).json()["orders"][0]["status"] == "delivered"


def test_room_booking_double_booking_prevention_and_webhook(isolated_client, monkeypatch):
    client, _ = isolated_client
    _, owner_token = _register(client, "Hostel Owner", "owner@test.edu", "hostel_owner")
    _, student1_token = _register(client, "Student One", "s1@test.edu", "student")
    _, student2_token = _register(client, "Student Two", "s2@test.edu", "student")
    _, admin_token = _login(client, "admin@studenthub.test", "AdminPass123!")

    # Owner creates hostel with capacity=1
    h_res = client.post(
        "/api/hostels",
        headers=_auth_headers(owner_token),
        json={
            "name": "GreenView PG",
            "area": "North Campus",
            "address": "90 College Road",
            "rent": 8000,
            "securityDeposit": 8000,
            "otherCharges": 500,
            "roomType": "Single",
            "genderPreference": "Boys",
            "capacity": 1,
            "totalRooms": 1,
            "availableRooms": 1,
            "amenities": ["Wi-Fi", "Security"],
            "rules": ["No smoking"],
        },
    )
    assert h_res.status_code == 201, h_res.text
    hostel = h_res.json()["hostel"]
    hostel_id = int(hostel["id"])
    room_id = int(hostel["rooms"][0]["id"])

    check_in = (date.today() + timedelta(days=5)).isoformat()
    avail = client.get(f"/api/hostels/{hostel_id}/availability?check_in_date={check_in}&duration_months=2")
    assert avail.status_code == 200
    assert avail.json()["available"] is True
    assert avail.json()["rooms"][0]["totalAmount"] == 24500.0  # 8000*2 + 8000 + 500

    # Student 1 books room
    b_res = client.post(
        "/api/room-bookings",
        headers=_auth_headers(student1_token),
        json={"hostelId": hostel_id, "roomId": room_id, "checkInDate": check_in, "durationMonths": 2},
    )
    assert b_res.status_code == 201, b_res.text
    booking = b_res.json()["booking"]
    assert booking["status"] == "Pending"
    assert booking["totalAmount"] == 24500.0

    # Duplicate booking by same student on overlapping dates is blocked
    dup_res = client.post(
        "/api/room-bookings",
        headers=_auth_headers(student1_token),
        json={"hostelId": hostel_id, "roomId": room_id, "checkInDate": check_in, "durationMonths": 1},
    )
    assert dup_res.status_code == 409

    # Owner approves -> Payment Pending
    appr = client.patch(
        f"/api/owner/room-bookings/{booking['id']}",
        headers=_auth_headers(owner_token),
        json={"status": "Payment Pending"},
    )
    assert appr.status_code == 200
    assert appr.json()["booking"]["status"] == "Payment Pending"

    # Student 2 cannot book overlapping capacity=1 room while Student 1's booking is Payment Pending
    s2_res = client.post(
        "/api/room-bookings",
        headers=_auth_headers(student2_token),
        json={"hostelId": hostel_id, "roomId": room_id, "checkInDate": check_in, "durationMonths": 2},
    )
    assert s2_res.status_code == 409

    # Razorpay order + webhook payment verification
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_123456")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "test_secret_key_789")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "test_webhook_secret_456")

    with patch("app.api.payments.create_razorpay_order", return_value={"id": "order_rzp_bk1", "amount": 2450000, "currency": "INR"}):
        pay_res = client.post(
            "/api/payments/create-order",
            headers=_auth_headers(student1_token),
            json={"paymentType": "booking", "referenceId": int(booking["id"])},
        )
        assert pay_res.status_code == 201

    webhook_payload = json.dumps(
        {
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": "pay_rzp_bk1", "order_id": "order_rzp_bk1"}}},
        }
    ).encode()
    # Invalid webhook signature -> 401
    assert client.post("/api/payments/webhook/razorpay", content=webhook_payload, headers={"X-Razorpay-Signature": "bad"}).status_code == 401

    good_wh_sig = hmac.new(b"test_webhook_secret_456", webhook_payload, hashlib.sha256).hexdigest()
    wh_res = client.post("/api/payments/webhook/razorpay", content=webhook_payload, headers={"X-Razorpay-Signature": good_wh_sig})
    assert wh_res.status_code == 200
    assert wh_res.json()["status"] == "paid"

    # Booking is now Paid & room occupancy updated
    my_bookings = client.get("/api/room-bookings", headers=_auth_headers(student1_token)).json()["bookings"]
    assert my_bookings[0]["status"] == "Paid"
    updated_hostel = client.get(f"/api/hostels/{hostel_id}").json()["hostel"]
    assert updated_hostel["occupied"] == 1
    assert updated_hostel["isAvailable"] is False

    # Student 1 cancels before check-in -> occupancy released
    cancel_res = client.post(
        f"/api/room-bookings/{booking['id']}/cancel",
        headers=_auth_headers(student1_token),
        json={"reason": "Plans changed"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["booking"]["status"] == "Cancelled"
    assert client.get(f"/api/hostels/{hostel_id}").json()["hostel"]["isAvailable"] is True

    # Admin verifies hostel & views stats
    assert client.patch(f"/api/admin/hostels/{hostel_id}/verify", headers=_auth_headers(admin_token)).json()["hostel"]["verified"] is True
    assert client.get("/api/admin/overview", headers=_auth_headers(admin_token)).json()["stats"]["bookings"] >= 1
    assert client.get("/api/notifications", headers=_auth_headers(student1_token)).json()["unreadCount"] >= 1
