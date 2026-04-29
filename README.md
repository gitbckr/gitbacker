<div align="center">

<img src="frontend/public/gitbacker-logo-filled.svg" alt="Gitbacker" width="96" />

# Gitbacker

**Self-hosted, automated backups for every git repository you care about.**

[![License](https://img.shields.io/github/license/gitbckr/gitbacker?color=blue)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/gitbckr/gitbacker?include_prereleases&sort=semver)](https://github.com/gitbckr/gitbacker/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/gitbckr/gitbacker/ci.yml?branch=main&label=CI)](https://github.com/gitbckr/gitbacker/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker)](https://github.com/gitbckr?tab=packages&repo_name=gitbacker)
[![Conventional Commits](https://img.shields.io/badge/conventional%20commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Node 22+](https://img.shields.io/badge/node-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Celery](https://img.shields.io/badge/Celery-37814A?logo=celery&logoColor=white)](https://docs.celeryq.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)

[Quick Start](#quick-start-self-hosting) · [Features](#features) · [Architecture](#architecture) · [Development](#development-setup) · [Contributing](#contributing)

</div>

---

## Why Gitbacker?

Hosted git providers are excellent — until your account is suspended, a repository is force-deleted, a contractor revokes access, or a service goes down. Gitbacker is the insurance policy: a tiny, self-hosted service that mirrors every repository you care about on a schedule you control, to storage *you* own. One `docker compose up`, done.

Designed for **paranoid CEOs, junior DevOps engineers, and small teams** who want backups that survive the outage — simple enough for a non-technical user, powerful enough for a DevOps engineer.

## Features

- **Backup any git repo** — paste one or more URLs, pick a destination, done
- **Scheduled backups** — cron-based scheduling with sensible global defaults
- **Restore** — force-mirror push a snapshot back to any git remote
- **Encryption at rest** — GPG symmetric encryption for backup archives
- **Git credentials** — store PATs or SSH keys per host for private repos
- **Notifications** — Slack, Discord, email (SMTP), generic webhooks, or any [Apprise](https://github.com/caronc/apprise)-supported service for backup/restore failures and low disk space
- **Multi-user** — admin and operator roles with per-repo permissions
- **Self-hosted** — single `docker compose up` runs the whole stack

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

This starts PostgreSQL, Redis, the API, the Celery worker, and the frontend. Open <http://localhost:3000> to get started.

### Seed the admin account

```bash
docker compose exec api python seed_admin.py
```

Default credentials: `admin@gitbacker.local` / `admin`. Change these via `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables before seeding.

### Pin a release version

```bash
VERSION=0.17.2 docker compose up -d
```

Releases are published to GitHub Container Registry as `ghcr.io/gitbckr/gitbacker-{api,worker,frontend}`.

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

Services are fully decoupled at runtime. Scale, restart, or redeploy any of them independently — the worker can be horizontally scaled for large fleets, the API can be restarted without interrupting running backups.

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

Open <http://localhost:3000> and log in with `admin@gitbacker.local` / `admin`.

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

1. **Settings → Encryption** — add a GPG encryption key (optional)
2. **Settings → General** — set the default backup schedule and encryption preference
3. **Destinations** — add a storage destination (local path) and mark it as default
4. **Settings → Git Credentials** — add a PAT or SSH key for private repo access (optional)
5. **Settings → Notifications** — wire up a Slack, Discord, email, or webhook channel for failure alerts (optional)
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
| `JWT_SECRET` | — | **Required.** Secret key for JWT token signing *and* credential encryption |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token TTL |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `INTERNAL_API_URL` | `http://localhost:8000` | API URL for frontend server-side proxy (Docker only) |
| `POSTGRES_USER` | `gitbacker` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `gitbacker` | PostgreSQL password |
| `POSTGRES_DB` | `gitbacker` | PostgreSQL database name |
| `BACKUP_DIR` | `./data/backups` | Host directory mounted as `/data/backups` in the worker |

## CI/CD

The GitHub Actions pipeline runs on every push and PR to `main`:

1. **Test** — backend pytest (API + worker) + frontend TypeScript check
2. **Release** — [semantic-release](https://semantic-release.gitbook.io/) analyzes conventional commits and creates a GitHub release if warranted
3. **Docker** — builds and pushes all three images to GitHub Container Registry

Commit format follows [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: ...` — patch release
- `feat: ...` — minor release
- `feat!: ...` or `BREAKING CHANGE:` — major release

## Contributing

Contributions are welcome. Whether it's a bug report, a feature idea, or a pull request, all are appreciated.

1. **Report a bug** — open an [issue](https://github.com/gitbckr/gitbacker/issues) with reproduction steps
2. **Propose a feature** — open a [discussion](https://github.com/gitbckr/gitbacker/discussions) so we can align on scope before you write code
3. **Submit a PR** — fork, branch from `main`, follow Conventional Commits, and open a pull request

Before you push, please run the test suites in `backend/api` and `backend/backup-core` and make sure the frontend type-checks (`cd frontend && pnpm build`).

## Security

If you find a security issue, please **do not** open a public issue. Email the maintainer directly or use GitHub's [private vulnerability reporting](https://github.com/gitbckr/gitbacker/security/advisories/new).

## License

[Apache License 2.0](./LICENSE) — free for personal and commercial use.
