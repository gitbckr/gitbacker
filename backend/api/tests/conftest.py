import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from shared.enums import IdentityProvider, StorageType, UserRole
from shared.models import Base, Destination, User, UserIdentity


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Drop partial unique index that doesn't work correctly on SQLite
        await conn.execute(
            text("DROP INDEX IF EXISTS ix_destinations_single_default")
        )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def admin_user(db_session):
    user = User(email="admin@test.com", name="Admin", role=UserRole.ADMIN)
    db_session.add(user)
    await db_session.flush()
    identity = UserIdentity(
        user_id=user.id,
        provider=IdentityProvider.LOCAL,
        provider_key="admin@test.com",
        secret_hash=hash_password("adminpass"),
    )
    db_session.add(identity)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def operator_user(db_session):
    user = User(email="operator@test.com", name="Operator", role=UserRole.OPERATOR)
    db_session.add(user)
    await db_session.flush()
    identity = UserIdentity(
        user_id=user.id,
        provider=IdentityProvider.LOCAL,
        provider_key="operator@test.com",
        secret_hash=hash_password("operatorpass"),
    )
    db_session.add(identity)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def default_destination(db_session, admin_user):
    dest = Destination(
        alias="Default Local",
        storage_type=StorageType.LOCAL,
        path="/tmp/backups",
        is_default=True,
        created_by=admin_user.id,
    )
    db_session.add(dest)
    await db_session.flush()
    return dest
