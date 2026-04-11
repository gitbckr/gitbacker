import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from app.auth import create_token, decode_token, hash_password, verify_password
from app.config import JWT_ALGORITHM, JWT_SECRET


def test_hash_and_verify_password():
    hashed = hash_password("testpass")
    assert verify_password("testpass", hashed)


def test_verify_password_wrong():
    hashed = hash_password("testpass")
    assert not verify_password("wrongpass", hashed)


def test_create_access_token_decodable():
    user_id = uuid.uuid4()
    token = create_token(user_id, "access")
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "access"


def test_create_refresh_token_type():
    user_id = uuid.uuid4()
    token = create_token(user_id, "refresh")
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert payload["type"] == "refresh"


def test_decode_token_expired():
    payload = {
        "sub": str(uuid.uuid4()),
        "type": "access",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token)
    assert exc_info.value.status_code == 401


def test_decode_token_invalid_signature():
    payload = {
        "sub": str(uuid.uuid4()),
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, "wrong-secret", algorithm=JWT_ALGORITHM)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token)
    assert exc_info.value.status_code == 401


def test_decode_token_garbage():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not.a.real.token")
    assert exc_info.value.status_code == 401
