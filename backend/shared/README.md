# Shared

Internal Python package containing SQLAlchemy models, Pydantic schemas, Celery task signatures, and shared enums/types.

Used as a path dependency by both `api` and `backup-core`. Not run directly.

## Install

This package is installed automatically when you `uv sync` in either `backend/api/` or `backend/backup-core/`.

To install standalone for development:

```bash
cd backend/shared
uv sync
```

## Tests

No Docker or Postgres required — tests run against pure Python.

```bash
cd backend/shared
uv sync --extra dev
uv run pytest -v
```