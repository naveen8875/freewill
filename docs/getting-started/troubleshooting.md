# Troubleshooting

## A port is already in use

Change the corresponding value in `.env`:

```text
APP_PORT=5173
POSTGRES_PORT=55432
DASHBOARD_PORT=8080
BRAIN_PORT=8008
```

The host PostgreSQL port defaults to `55432` specifically to avoid the common local `5432` conflict.

## The app reports a failed fetch

Check both services:

```bash
docker compose ps
docker compose logs --tail=100 app brain
curl http://localhost:5173/api/health/ready
curl http://127.0.0.1:8008/v1/health
```

The local brain service can fail while the app remains healthy. The selected villager will visibly wait and retry; Freewill does not silently switch to the lab policy.

## An experiment was interrupted

The production experiment manager marks genuinely interrupted work and keeps the saved configuration safe to retry. Do not run multiple recovery owners against the same database. During Vite development, leave `FREEWILL_DEV_RECOVER_INTERRUPTED=false` when Docker already owns recovery.

## The browser is showing old runtime scripts

Stop Vite, remove its cache, and restart:

```bash
rm -rf node_modules/.vite
pnpm dev
```

Do not delete named Docker volumes unless you intentionally want to remove worlds, experiments, and saved brains.

