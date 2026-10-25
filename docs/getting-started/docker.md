# Docker setup

Docker Compose is the supported way to run the complete Freewill stack.

## Requirements

- Docker Desktop or Docker Engine with Compose.
- Roughly 4 GB of free memory for comfortable local use.

## Start

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The stack contains:

| Service | Default address | Purpose |
| --- | --- | --- |
| `app` | `http://localhost:5173` | Game, static assets, world APIs, and local brain gateway |
| `brain` | `http://127.0.0.1:8008` | CPU-only local neural decisions and evolution |
| `postgres` | `127.0.0.1:55432` | Persistent worlds, experiments, and telemetry |
| `dashboard` | `http://127.0.0.1:8080` | Local Adminer database viewer |

Check readiness:

```bash
curl http://localhost:5173/api/health/ready
curl http://127.0.0.1:8008/v1/health
```

Stop containers without deleting data:

```bash
docker compose down
```

The named `freewill_postgres` and `freewill_brains` volumes survive normal shutdown. `docker compose down -v` deletes them and should only be used when intentionally resetting all local data.

Continue with [configuration](configuration.md) or the complete [deployment guide](../operations/deployment.md).

