import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from app.core.config import AppConfig


def is_razorpay_configured(config: AppConfig) -> bool:
    return bool(config.razorpay_key_id and config.razorpay_key_secret)


def create_razorpay_order(
    config: AppConfig,
    amount_rupees: float,
    currency: str,
    receipt: str,
    notes: dict[str, str],
) -> dict:
    if not config.razorpay_key_id or not config.razorpay_key_secret:
        raise RuntimeError("Razorpay credentials are not configured")

    amount_paise = int(round(amount_rupees * 100))
    if amount_paise <= 0:
        raise ValueError("Payment amount must be greater than zero")

    payload = json.dumps(
        {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt[:40],
            "notes": notes,
        }
    ).encode("utf-8")

    credentials = base64.b64encode(f"{config.razorpay_key_id}:{config.razorpay_key_secret}".encode("utf-8")).decode("utf-8")
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders",
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Razorpay order creation failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Unable to reach Razorpay API: {exc.reason}") from exc


def verify_razorpay_signature(key_secret: str, gateway_order_id: str, gateway_payment_id: str, signature: str) -> bool:
    message = f"{gateway_order_id}|{gateway_payment_id}".encode("utf-8")
    expected = hmac.new(key_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_razorpay_webhook_signature(webhook_secret: str, raw_body: bytes, signature: str) -> bool:
    expected = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
