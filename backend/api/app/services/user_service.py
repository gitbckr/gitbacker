import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password
from app.repositories import user_repo
from shared.enums import IdentityProvider
from shared.models import (
    Destination,
    EncryptionKey,
    GitCredential,
    NotificationChannel,
    Repository,
    User,
    UserIdentity,
)
from shared.schemas import PasswordChange, UserCreate, UserSelfUpdate, UserUpdate


async def create_user(db: AsyncSession, body: UserCreate) -> User:
    existing = await user_repo.get_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=body.email, name=body.name, role=body.role)
    await user_repo.create(db, user)

    identity = UserIdentity(
        user_id=user.id,
        provider=IdentityProvider.LOCAL,
        provider_key=body.email,
        secret_hash=hash_password(body.password),
    )
    await user_repo.create_identity(db, identity)
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(db: AsyncSession) -> list[User]:
    return await user_repo.list_all(db)


async def update_me(
    db: AsyncSession, user: User, body: UserSelfUpdate
) -> User:
    """Update the current user's own profile fields (name only)."""
    await user_repo.update(db, user, body.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession, user_id: str, body: UserUpdate, current_user: User
) -> User:
    if str(current_user.id) == user_id:
        if body.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )
        # Compare by value to avoid enum-vs-string mismatch across the
        # Pydantic/SQLAlchemy boundary.
        if body.role is not None and (
            getattr(body.role, "value", body.role)
            != getattr(current_user.role, "value", current_user.role)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role",
            )

    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await user_repo.update(db, user, body.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(user)
    return user


_OWNED_MODELS = (
    ("repositories", Repository),
    ("destinations", Destination),
    ("encryption_keys", EncryptionKey),
    ("notification_channels", NotificationChannel),
    ("git_credentials", GitCredential),
)


async def _count_owned(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    counts: dict[str, int] = {}
    for key, model in _OWNED_MODELS:
        n = (
            await db.execute(
                select(func.count()).select_from(model).where(model.created_by == user_id)
            )
        ).scalar_one()
        if n:
            counts[key] = n
    return counts


def _humanize(counts: dict[str, int]) -> str:
    labels = {
        "repositories": ("repository", "repositories"),
        "destinations": ("destination", "destinations"),
        "encryption_keys": ("encryption key", "encryption keys"),
        "notification_channels": ("notification channel", "notification channels"),
        "git_credentials": ("git credential", "git credentials"),
    }
    parts = [
        f"{n} {labels[key][0] if n == 1 else labels[key][1]}"
        for key, n in counts.items()
    ]
    return ", ".join(parts)


async def delete_user(
    db: AsyncSession,
    user_id: str,
    current_user: User,
    reassign_to: str | None = None,
) -> None:
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    user = await user_repo.get_by_id(db, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Resolve reassignment target first, if provided.
    reassign_uuid: uuid.UUID | None = None
    if reassign_to:
        try:
            reassign_uuid = uuid.UUID(reassign_to)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="reassign_to is not a valid UUID",
            ) from e
        if reassign_uuid == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reassign to the user being deleted",
            )
        target = await user_repo.get_by_id(db, reassign_uuid)
        if not target or not target.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="reassign_to must point to an active user",
            )

    counts = await _count_owned(db, user.id)

    if counts and reassign_uuid is None:
        # Structured payload so the frontend can render a rich confirm dialog.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "owns_resources",
                "message": "Cannot delete user — they still own "
                + _humanize(counts)
                + ". Reassign or deactivate them first.",
                "counts": counts,
            },
        )

    if counts and reassign_uuid is not None:
        # Bulk-reassign every owned FK in-transaction.
        from sqlalchemy import update

        for _, model in _OWNED_MODELS:
            await db.execute(
                update(model)
                .where(model.created_by == user.id)
                .values(created_by=reassign_uuid)
            )

    await db.delete(user)
    await db.commit()


async def change_password(db: AsyncSession, user: User, body: PasswordChange) -> None:
    identity = await user_repo.get_identity(db, user.id, IdentityProvider.LOCAL)
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No local password set for this account",
        )

    if not verify_password(body.current_password, identity.secret_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        )

    identity.secret_hash = hash_password(body.new_password)
    await db.commit()
