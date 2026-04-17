# Gitbacker

Self-hosted git repository backup tool. Connect your GitHub, GitLab, or Bitbucket repos, configure schedules and destinations, and the system handles the rest.

Built for paranoid CEOs, junior DevOps engineers, and small teams who want to own their backups.

## Features

- **Backup any git repo** — paste one or more URLs, pick a destination, done
- **Scheduled backups** — cron-based scheduling with sensible defaults
- **Restore** — force-mirror push a snapshot back to any git remote
- **Encryption** — GPG symmetric encryption for backup archives
- **Git credentials** — store PATs or SSH keys per host for private repos
- **Notifications** — Slack alerts on backup/restore failures and low disk space
- **Multi-user** — admin and operator roles with per-repo permissions
- **Self-hosted** — single `docker compose up` to run everything

## Quick Start (Self-Hosting)

```bash
git clone https://github.com/gitbckr/gitbacker.git
cd gitbacker
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET`, then:

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the API, the Celery worker, and the frontend. Open [http://localhost:3000](http://localhost:3000) to get started.

### Seed the admin account

```bash
docker compose exec api python seed_admin.py
```

Default credentials: `admin@gitbacker.local` / `admin`. Change these via `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.

### Pin a release version

```bash
VERSION=0.5.0 docker compose up -d
```

## Architecture

```
Browser
  |
  v
[Frontend]  --/api/-->  [API]  --Celery-->  [Worker]
  Next.js                FastAPI              Celery
  :3000                  :8000
                          |                     |
                          +----------+----------+
                                     v
                               [PostgreSQL]  [Redis]
```

| Service | Does | Doesn't |
|---------|------|---------|
| Frontend | UI, user interactions, API calls | Business logic |
| API | Auth, validation, HTTP, task dispatch | Run backups |
| Worker | Git operations, encryption, storage | HTTP, auth |

Services are fully decoupled at runtime. Scale, restart, or redeploy any of them independently.

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 22+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [pnpm](https://pnpm.io/) (Node package manager)
- Docker (for PostgreSQL and Redis)

### Start infrastructure

```bash
cd infra
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
```

PostgreSQL runs on port **5432**, Redis on **6379**.

### Run services

```bash
# Terminal 1 — API
cd backend/api
uv sync
uv run uvicorn main:app --reload --port 8000

# Terminal 2 — Worker (backup engine + scheduler)
cd backend/backup-core
uv sync
uv run celery -A worker worker --beat --loglevel=info

# Terminal 3 — Frontend
cd frontend
pnpm install
pnpm dev
```

### Seed admin user

```bash
cd backend/api
uv run python seed_admin.py
```

Open [http://localhost:3000](http://localhost:3000) and log in with `admin@gitbacker.local` / `admin`.

### Run tests

```bash
# API tests
cd backend/api
uv sync --extra dev
uv run pytest

# Worker tests
cd backend/backup-core
uv sync --extra dev
uv run pytest
```

## First-Time Setup (After Login)

1. **Settings > Encryption** — add a GPG encryption key (optional)
2. **Settings > General** — set the default backup schedule and encryption preference
3. **Destinations** — add a storage destination (local path) and mark it as default
4. **Settings > Git Credentials** — add a PAT or SSH key for private repo access (optional)
5. **Settings > Notifications** — add a Slack webhook for failure alerts (optional)
6. **Repos** — paste repo URLs, submit, watch them go green

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, shadcn/ui, Tailwind CSS, TanStack Query |
| API | FastAPI, SQLAlchemy (async), JWT auth |
| Worker | Celery, git (subprocess), GPG encryption |
| Database | PostgreSQL 16 |
| Broker | Redis 7 |
| Packaging | uv (Python), pnpm (Node) |
| CI/CD | GitHub Actions, semantic-release |
| Containers | Docker, multi-stage builds |

## Project Structure

```
gitbacker/
├── frontend/                 # Next.js web application
├── backend/
│   ├── api/                  # FastAPI — HTTP layer
│   ├── backup-core/          # Celery workers — backup engine
│   └── shared/               # Shared models, schemas, enums
├── infra/
│   ├── docker-compose.dev.yml
│   └── docker/
│       ├── Dockerfile.api
│       ├── Dockerfile.worker
│       └── Dockerfile.frontend
├── docker-compose.yml        # Production self-hosting
├── .github/workflows/ci.yml  # CI/CD pipeline
└── .env.example
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (asyncpg for API, psycopg2 for worker) |
| `REDIS_URL` | — | Redis connection string |
| `JWT_SECRET` | — | **Required.** Secret key for JWT token signing |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token TTL |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `INTERNAL_API_URL` | `http://localhost:8000` | API URL for frontend server-side proxy (Docker only) |
| `POSTGRES_USER` | `gitbacker` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `gitbacker` | PostgreSQL password |
| `POSTGRES_DB` | `gitbacker` | PostgreSQL database name |

## CI/CD

The GitHub Actions pipeline runs on every push and PR to `main`:

1. **Test** — backend pytest (API + worker) + frontend TypeScript check
2. **Release** — [semantic-release](https://semantic-release.gitbook.io/) analyzes conventional commits and creates a GitHub release if warranted
3. **Docker** — builds and pushes all three images to GitHub Container Registry (`ghcr.io/gitbckr/gitbacker-{api,worker,frontend}`)

Commit format follows [Conventional Commits](https://www.conventionalcommits.org/):
- `fix: ...` — patch release
- `feat: ...` — minor release
- `feat!: ...` or `BREAKING CHANGE:` — major release

## License

See [LICENSE](LICENSE).
