import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

# backup-core uses sync SQLAlchemy (Celery tasks are sync)
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://gitbacker:gitbacker@localhost:5432/gitbacker"
)

# Replace async driver with sync driver for Celery workers
SYNC_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

# Use NullPool to avoid sharing connections across Celery prefork workers.
# Each task gets a fresh connection and closes it when done.
engine = create_engine(SYNC_DATABASE_URL, pool_pre_ping=True, poolclass=NullPool)
SessionLocal = sessionmaker(bind=engine)
