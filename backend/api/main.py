from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import DATABASE_URL
from app.db import engine
from app.routers import auth, dashboard, destinations, encryption_keys, git_credentials, notification_channels, repositories, restore, settings, users


def _read_version() -> str:
    """Read version from VERSION file at repo root."""
    for candidate in [
        Path(__file__).resolve().parent.parent.parent / "VERSION",  # dev: backend/api/main.py → repo root
        Path("/app/VERSION"),  # Docker
    ]:
        if candidate.is_file():
            return candidate.read_text().strip()
    return "0.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Run alembic migrations on startup
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command
    from pathlib import Path

    alembic_cfg = AlembicConfig(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    alembic_command.upgrade(alembic_cfg, "head")

    # Clean up stale jobs left in RUNNING/PENDING state from a previous crash.
    # These will never complete — mark them as failed so the UI doesn't show
    # stuck spinners forever.
    from sqlalchemy import text

    async with engine.begin() as conn:
        for table in ("backup_jobs", "restore_jobs"):
            await conn.execute(text(
                f"UPDATE {table} SET status = 'FAILED', "
                f"output_log = COALESCE(output_log || E'\\n', '') "
                f"|| 'ERROR: Job was still running when the server restarted', "
                f"finished_at = NOW() "
                f"WHERE status = 'RUNNING'"
            ))
        await conn.execute(text(
            "UPDATE restore_previews SET status = 'FAILED', "
            "error_message = 'Preview was still running when the server restarted', "
            "finished_at = NOW() "
            "WHERE status IN ('RUNNING', 'PENDING')"
        ))

    yield
    await engine.dispose()


app = FastAPI(title="Gitbacker API", version=_read_version(), lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(destinations.router, prefix="/api/destinations", tags=["destinations"])
app.include_router(repositories.router, prefix="/api/repositories", tags=["repositories"])
app.include_router(restore.router, prefix="/api/repositories", tags=["restore"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(encryption_keys.router, prefix="/api/encryption-keys", tags=["encryption-keys"])
app.include_router(git_credentials.router, prefix="/api/git-credentials", tags=["git-credentials"])
app.include_router(notification_channels.router, prefix="/api/notification-channels", tags=["notification-channels"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}
