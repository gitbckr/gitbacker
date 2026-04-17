# API

FastAPI service — handles auth, validation, CRUD, and dispatches Celery tasks to backup-core.

## Prerequisites

- Python 3.12+
- uv
- Postgres running on port 5432
- Redis running on port 6379

## Setup

```bash
# From repo root
cp .env.example .env   # edit as needed

# Install dependencies
cd backend/api
uv sync
```

## Run

```bash
uv run uvicorn main:app --reload --port 8000
```

## Database Migrations

```bash
uv run alembic upgrade head
```

## Seed Admin User

```bash
uv run python seed_admin.py
```

## Tests

No Docker, Postgres, or Redis required — tests use an in-memory SQLite database.

```bash
cd backend/api
uv sync --extra dev
uv run pytest -v
```