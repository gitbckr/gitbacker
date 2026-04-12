import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.db import get_db
from app.services import git_credential_service
from shared.models import User
from shared.schemas import GitCredentialCreate, GitCredentialRead

router = APIRouter()


@router.post("", response_model=GitCredentialRead, status_code=status.HTTP_201_CREATED)
async def create_git_credential(
    body: GitCredentialCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> GitCredentialRead:
    return await git_credential_service.create_git_credential(db, user, body)


@router.get("", response_model=list[GitCredentialRead])
async def list_git_credentials(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[GitCredentialRead]:
    return await git_credential_service.list_git_credentials(db)


@router.delete("/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_git_credential(
    cred_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> None:
    await git_credential_service.delete_git_credential(db, str(cred_id))
