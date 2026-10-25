# Freewill deployment

The repository ships a complete local production stack:

- `app`: compiled React game, same-origin world and local-brain APIs, migrations and health checks;
- `postgres`: PostgreSQL 17 with a persistent named volume;
- `dashboard`: Adminer for inspecting worlds, experiments, lineage, checkpoints and schema migrations.

## First start

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Open the game at `http://localhost:5173` and Adminer at `http://localhost:8080`.

Adminer login values for the defaults:

```text
System: PostgreSQL
Server: postgres
Username: freewill
Password: freewill-local-change-me
Database: freewill
```

Change `POSTGRES_PASSWORD` in `.env` before exposing any service beyond your own machine. PostgreSQL and Adminer bind to `127.0.0.1` by default; the game binds to `APP_PORT` on all interfaces.

## Configure local brains

The complete stack needs no external AI key. The app and brain service use a local shared token and a bounded CPU thread count:

```text
FREEWILL_BRAIN_TOKEN=change-me
FREEWILL_BRAIN_THREADS=2
```

Recreate only the app container so it receives the new environment:

```bash
docker compose up -d --force-recreate app
curl http://localhost:5173/api/health/ready
```

The app readiness endpoint checks PostgreSQL. The brain service has its own health endpoint at `http://127.0.0.1:8008/v1/health`. Keep the shared token server-only; never use a `VITE_` prefix.

## Storage and migrations

`server/database.ts` applies ordered migrations under a PostgreSQL advisory lock. Current schema version 6 provides:

- `worlds`: authoritative schema-v6 world documents and searchable metadata;
- `world_decisions`, `world_events`, and `world_checkpoints`: bounded replay history;
- `learning_experiments`, genome, lineage, episode, metric, and checkpoint tables for local evolution;
- `freewill_schema_migrations`: applied migration history.

The browser also writes a local IndexedDB copy after a successful PostgreSQL save. If the server is absent during local development, IndexedDB becomes the active backend. The UI shows the active storage backend explicitly.

Useful endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health/live` | process liveness |
| `GET /api/health/ready` | PostgreSQL readiness |
| `GET /api/status` | storage, database size/world count and replay-history counts |
| `GET /api/worlds` | saved-world metadata |
| `GET /api/worlds/:id` | one validated world document |
| `PUT /api/worlds/:id` | validate and upsert a world |
| `DELETE /api/worlds/:id` | remove a world |
| `/api/brain/*` | authenticated proxy to the local brain service |
| `/api/experiments/*` | experiment lifecycle, progress, lineage and replay data |

## Back up and restore

Create a logical backup without stopping the game:

```bash
docker compose exec -T postgres pg_dump -U freewill -d freewill > freewill-backup.sql
```

Restore into an empty Freewill database:

```bash
docker compose exec -T postgres psql -U freewill -d freewill < freewill-backup.sql
```

`docker compose down` preserves the named volume. `docker compose down -v` deletes all PostgreSQL data and is intentionally not part of the normal workflow.

## Operations

```bash
docker compose logs -f app
docker compose logs -f postgres
docker compose restart app
docker compose down
```

Override ports in `.env` with `APP_PORT`, `POSTGRES_PORT` and `DASHBOARD_PORT`. PostgreSQL publishes on host port `55432` by default to avoid colliding with a locally installed PostgreSQL server; containers continue to use port `5432` internally.

For public hosting, put the app behind an HTTPS reverse proxy, set `PUBLIC_APP_URL`, use a strong generated database password and brain token, keep PostgreSQL/Adminer private, add authentication and world ownership, and apply per-user/IP limits to experiment and brain routes. The included stack is hardened for a single operator, not an anonymous public SaaS.
