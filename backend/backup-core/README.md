# Backup Core

Celery worker service — executes git backup tasks dispatched by the API.

## Prerequisites

- Python 3.12+
- uv
- Postgres running on port 5432
- Redis running on port 6379
- git installed

## Setup

```bash
# From repo root
cp .env.example .env   # edit as needed

# Install dependencies
cd backend/backup-core
uv sync
```

## Run

```bash
# Worker only (no scheduled backups)
uv run celery -A worker worker --loglevel=info

# Worker + scheduler (scans for due repos every 60s)
uv run celery -A worker worker --beat --loglevel=info
```

In production, run the beat process separately (only one instance):

```bash
uv run celery -A worker beat --loglevel=info
```

## Tests

No Docker, Postgres, or Redis required — tests use an in-memory SQLite database and mock subprocess/git calls.

```bash
cd backend/backup-core
uv sync --extra dev
uv run pytest -v
```