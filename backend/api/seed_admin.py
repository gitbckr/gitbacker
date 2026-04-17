"""Seed an admin user for first-time setup. Run once."""
import asyncio
import os

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv()

from shared.enums import IdentityProvider, StorageType, UserRole
from shared.models import Base, Destination, User, UserIdentity
from app.auth import hash_password

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/data/backups")


DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://gitbacker:gitbacker@localhost:5555/gitbacker"
)

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@gitbacker.local")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Admin")

if not ADMIN_PASSWORD:
    print("Error: ADMIN_PASSWORD environment variable is required.")
    print("Usage: ADMIN_PASSWORD=your-secret python seed_admin.py")
    exit(1)


async def main() -> None:
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            # Update password for existing admin (handles volume reuse on reinstall)
            identity_result = await session.execute(
                select(UserIdentity).where(
                    UserIdentity.user_id == existing.id,
                    UserIdentity.provider == IdentityProvider.LOCAL,
                )
            )
            identity = identity_result.scalar_one_or_none()
            if identity:
                identity.secret_hash = hash_password(ADMIN_PASSWORD)
                await session.commit()
                print(f"Admin user {ADMIN_EMAIL} already exists, password updated.")
            else:
                print(f"Admin user {ADMIN_EMAIL} exists but has no local identity.")
            await _seed_default_destination(session, existing.id)
            return

        user = User(email=ADMIN_EMAIL, name=ADMIN_NAME, role=UserRole.ADMIN)
        session.add(user)
        await session.flush()

        identity = UserIdentity(
            user_id=user.id,
            provider=IdentityProvider.LOCAL,
            provider_key=ADMIN_EMAIL,
            secret_hash=hash_password(ADMIN_PASSWORD),
        )
        session.add(identity)
        await session.commit()
        print(f"Admin user created: {ADMIN_EMAIL}")

        # Seed default local destination
        admin_id = user.id
        await _seed_default_destination(session, admin_id)

    await engine.dispose()


async def _seed_default_destination(session: AsyncSession, admin_id) -> None:
    """Create the default local backup destination if none exists."""
    from sqlalchemy import func

    count = await session.scalar(select(func.count()).select_from(Destination))
    if count and count > 0:
        return

    dest = Destination(
        alias="Local backups",
        storage_type=StorageType.LOCAL,
        path=BACKUP_DIR,
        is_default=True,
        created_by=admin_id,
    )
    session.add(dest)
    await session.commit()
    print(f"Default destination created: {BACKUP_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
