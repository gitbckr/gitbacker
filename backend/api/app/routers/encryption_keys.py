import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.db import get_db
from app.services import encryption_key_service
from shared.models import User
from shared.schemas import EncryptionKeyCreate, EncryptionKeyRead

router = APIRouter()


@router.post("", response_model=EncryptionKeyRead, status_code=status.HTTP_201_CREATED)
async def create_encryption_key(
    body: EncryptionKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> EncryptionKeyRead:
    return await encryption_key_service.create_encryption_key(db, user, body)


@router.get("", response_model=list[EncryptionKeyRead])
async def list_encryption_keys(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[EncryptionKeyRead]:
    return await encryption_key_service.list_encryption_keys(db)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_encryption_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> None:
    await encryption_key_service.delete_encryption_key(db, str(key_id))
