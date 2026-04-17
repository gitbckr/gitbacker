import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import JWT_SECRET
from app.repositories import git_credential_repo
from shared.crypto import encrypt_field
from shared.enums import CredentialType
from shared.models import GitCredential, User
from shared.schemas import GitCredentialCreate, GitCredentialRead

logger = logging.getLogger(__name__)


def _derive_public_key(private_key_pem: str) -> str | None:
    """Derive the OpenSSH public key from a private key. Returns None on failure."""
    try:
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
            load_ssh_private_key,
        )

        private_key = load_ssh_private_key(private_key_pem.encode(), password=None)
        return private_key.public_key().public_bytes(
            Encoding.OpenSSH, PublicFormat.OpenSSH
        ).decode()
    except Exception as e:
        logger.warning("Could not derive public key: %s", e)
        return None


async def create_git_credential(
    db: AsyncSession, user: User, body: GitCredentialCreate
) -> GitCredentialRead:
    public_key = None
    if body.credential_type == CredentialType.SSH_KEY:
        public_key = _derive_public_key(body.credential_data)

    cred = GitCredential(
        name=body.name,
        credential_type=body.credential_type,
        host=body.host,
        username=body.username,
        credential_data=encrypt_field(body.credential_data, JWT_SECRET),
        public_key=public_key,
        created_by=user.id,
    )
    await git_credential_repo.create(db, cred)
    await db.commit()
    await db.refresh(cred)
    return GitCredentialRead.model_validate(cred)


async def list_git_credentials(db: AsyncSession) -> list[GitCredentialRead]:
    creds = await git_credential_repo.list_all(db)
    return [GitCredentialRead.model_validate(c) for c in creds]


async def delete_git_credential(db: AsyncSession, cred_id: str) -> None:
    cred = await git_credential_repo.get_by_id(db, uuid.UUID(cred_id))
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Git credential not found",
        )
    await git_credential_repo.delete(db, cred)
    await db.commit()
