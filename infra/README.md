# Infra

Docker Compose setup for local development (Postgres + Redis).

## Prerequisites

- Docker + Docker Compose

## Run

```bash
cd infra
docker compose -f docker-compose.dev.yml up -d
```

This starts:

- **Postgres** on port `5555`
- **Redis** on port `6666`

## Stop

```bash
docker compose -f docker-compose.dev.yml down
```

## Reset Data

```bash
docker compose -f docker-compose.dev.yml down -v
```
