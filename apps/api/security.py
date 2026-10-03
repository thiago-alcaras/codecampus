import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit
from fastapi import HTTPException, Request, Depends
from sqlalchemy import select, update
from .db import Session, User, LoginSession, RateBucket

PRODUCTION = os.getenv("APP_ENV") == "production"
ORIGIN = os.getenv("APP_ORIGIN", "http://127.0.0.1:8000").rstrip("/")
if PRODUCTION and not ORIGIN.startswith("https://"):
    raise RuntimeError("APP_ORIGIN must use HTTPS in production")


def now():
    return int(time.time())


def uid():
    return secrets.token_hex(16)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def hash_password(password):
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return f"{salt}:{key.hex()}"


def verify_password(password, encoded):
    salt, expected = encoded.split(":")
    actual = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()
    return hmac.compare_digest(actual, expected)


def db_session():
    with Session() as db:
        yield db


def principal(request: Request, db=Depends(db_session)):
    token = request.cookies.get("campus_session", "")
    session = db.get(LoginSession, digest(token))
    if not session or session.expires <= now():
        raise HTTPException(401, "Sua sessão expirou. Entre novamente.")
    user = db.get(User, session.user_id)
    if not user or not user.active:
        raise HTTPException(401, "Conta indisponível.")
    request.state.session = session
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not hmac.compare_digest(
            request.headers.get("x-csrf-token", ""), session.csrf
        ):
            raise HTTPException(403, "Requisição inválida. Atualize a página.")
    return user


def staff(user):
    if user.role not in ("admin", "teacher"):
        raise HTTPException(403, "Acesso exclusivo da equipe.")


def admin(user):
    if user.role != "admin":
        raise HTTPException(403, "Acesso exclusivo da administração.")


def safe_url(value):
    if not value:
        return ""
    url = urlsplit(value)
    if url.scheme != "https" or not url.netloc or url.username or url.password:
        raise HTTPException(422, "Use um endereço HTTPS válido.")
    return value


def rate_limit(db, key, limit=8, seconds=900):
    # Database-backed buckets work across processes; increments are atomic.
    key = digest(key)
    bucket = db.get(RateBucket, key)
    if not bucket:
        try:
            db.add(RateBucket(id=key, count=1, reset_at=now() + seconds))
            db.commit()
            return
        except Exception:
            db.rollback()
            bucket = db.get(RateBucket, key)
            if not bucket:
                raise
    if bucket.reset_at <= now():
        db.execute(
            update(RateBucket)
            .where(RateBucket.id == key, RateBucket.reset_at <= now())
            .values(count=0, reset_at=now() + seconds)
        )
        db.commit()
    count = db.execute(
        update(RateBucket)
        .where(RateBucket.id == key)
        .values(count=RateBucket.count + 1)
        .returning(RateBucket.count)
    ).scalar_one()
    db.commit()
    if count > limit:
        raise HTTPException(429, "Muitas tentativas. Aguarde e tente novamente.")
