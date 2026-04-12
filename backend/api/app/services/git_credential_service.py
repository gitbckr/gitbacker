import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import git_credential_repo
from shared.models import GitCredential, User
from shared.schemas import GitCredentialCreate, GitCredentialRead


async def create_git_credential(
    db: AsyncSession, user: User, body: GitCredentialCreate
) -> GitCredentialRead:
    cred = GitCredential(
        name=body.name,
        credential_type=body.credential_type,
        host=body.host,
        username=body.username,
        credential_data=body.credential_data,
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
