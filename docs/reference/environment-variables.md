# Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PORT` | `5173` | Host port for the production app |
| `POSTGRES_PORT` | `55432` | Loopback host port for PostgreSQL |
| `DASHBOARD_PORT` | `8080` | Loopback host port for Adminer |
| `BRAIN_PORT` | `8008` | Loopback host port for the brain service |
| `POSTGRES_DB` | `freewill` | Database name |
| `POSTGRES_USER` | `freewill` | Database user |
| `POSTGRES_PASSWORD` | local development value | Database password; change outside local development |
| `DATABASE_URL` | unset | Direct database connection for Vite/local Node development |
| `DATABASE_POOL_SIZE` | `10` | Node PostgreSQL pool size |
| `PUBLIC_APP_URL` | `http://localhost:5173` | Public origin used by server integrations |
| `DATABASE_DASHBOARD_URL` | `http://localhost:8080` | Link shown for the local database dashboard |
| `FREEWILL_BRAIN_TOKEN` | local development value | Shared app-to-brain credential |
| `FREEWILL_BRAIN_THREADS` | `2` | CPU threads used by the brain service |
| `FREEWILL_DEV_RECOVER_INTERRUPTED` | `false` | Allow a Vite process to recover interrupted experiments |
Never prefix a secret with `VITE_`.

