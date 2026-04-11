from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import engine
from app.routers import auth, dashboard, destinations, encryption_keys, repositories, settings, users
from shared.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # In dev, create tables if they don't exist (migrations are preferred in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="Gitbacker API", version="0.1.0", lifespan=lifespan)

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
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(encryption_keys.router, prefix="/api/encryption-keys", tags=["encryption-keys"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
