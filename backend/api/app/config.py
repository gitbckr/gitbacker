import os
import warnings

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://gitbacker:gitbacker@localhost:5555/gitbacker"
)
REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6666/0")
_JWT_DEFAULT = "changeme-to-a-random-secret"
JWT_SECRET: str = os.environ.get("JWT_SECRET", _JWT_DEFAULT)
if JWT_SECRET == _JWT_DEFAULT:
    warnings.warn(
        "JWT_SECRET is using the default value. Set a strong secret via environment variable.",
        stacklevel=1,
    )
JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("REFRESH_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days
