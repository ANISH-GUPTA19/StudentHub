import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import load_config
from .database import get_db


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240000)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    if "$" not in stored:
        legacy = base64.b64encode(hashlib.pbkdf2_hmac("sha256", password.encode(), b"studenthub", 120000)).decode()
        return hmac.compare_digest(legacy, stored)
    salt_text, digest_text = stored.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_text), 240000)
    return hmac.compare_digest(base64.b64encode(digest).decode(), digest_text)


def create_token(user_id: str, role: str, ttl_seconds: int = 86400) -> str:
    secret = load_config().auth_secret
    payload = {"sub": user_id, "role": role, "exp": int(time.time()) + ttl_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def require_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    secret = load_config().auth_secret
    try:
        encoded, signature = token.rsplit(".", 1)
        expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded).decode())
        if payload["exp"] < int(time.time()):
            raise ValueError("expired")
        from app.models.entities import User

        user = db.get(User, int(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401, detail="Account not found")
        return {"sub": str(user.id), "role": user.role, "email": user.email, "name": user.name}
    except HTTPException:
        raise
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def require_roles(*allowed_roles: str):
    def dependency(user: dict = Depends(require_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user

    return dependency
