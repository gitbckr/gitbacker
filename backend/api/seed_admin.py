"""Seed an admin user for first-time setup. Run once."""
import asyncio
import os

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv()

from shared.enums import IdentityProvider, UserRole
from shared.models import Base, User, UserIdentity
from app.auth import hash_password


DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://gitbacker:gitbacker@localhost:5555/gitbacker"
)

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@gitbacker.local")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Admin")


async def main() -> None:
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        if result.scalar_one_or_none():
            print(f"Admin user {ADMIN_EMAIL} already exists, skipping.")
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

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
