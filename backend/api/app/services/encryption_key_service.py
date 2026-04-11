import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import encryption_key_repo
from app.services.settings_service import get_settings
from shared.models import EncryptionKey, User
from shared.schemas import EncryptionKeyCreate, EncryptionKeyRead


async def create_encryption_key(
    db: AsyncSession, user: User, body: EncryptionKeyCreate
) -> EncryptionKeyRead:
    key = EncryptionKey(
        name=body.name,
        backend=body.backend,
        key_data=body.key_data,
        created_by=user.id,
    )
    await encryption_key_repo.create(db, key)
    await db.commit()
    await db.refresh(key)
    return EncryptionKeyRead.model_validate(key)


async def list_encryption_keys(db: AsyncSession) -> list[EncryptionKeyRead]:
    keys = await encryption_key_repo.list_all(db)
    return [EncryptionKeyRead.model_validate(k) for k in keys]


async def delete_encryption_key(db: AsyncSession, key_id: str) -> None:
    key = await encryption_key_repo.get_by_id(db, uuid.UUID(key_id))
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Encryption key not found"
        )

    # Block deletion if this key is the current default
    settings = await get_settings(db)
    if settings.default_encryption_key_id == key.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete the default encryption key. Remove it as default first.",
        )

    await encryption_key_repo.delete(db, key)
    await db.commit()
