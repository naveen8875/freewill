# HTTP API

## Health and status

- `GET /api/health/live` — process liveness.
- `GET /api/health/ready` — database and provider readiness.
- `GET /api/status` — storage and bounded provider telemetry summary.

## Worlds

- `GET /api/worlds` — saved-world metadata.
- `GET /api/worlds/:id` — one validated world document.
- `PUT /api/worlds/:id` — validate and upsert a world.
- `DELETE /api/worlds/:id` — delete a world.
- World history endpoints used by the client expose bounded decisions, events, and checkpoints.

## Decisions

- `/api/brain/*` — authenticated proxy to local brain-service contracts.

## Experiments

The `/api/experiments` routes create, start, stop, resume, inspect, and read generations/episodes/observatory frames through `server/experimentApi.ts`. Request and response bodies are validated against the TypeScript experiment contracts.

This alpha API is same-origin and not yet promised as a stable third-party network API. Consult the route implementations and contract schemas before integrating another client.

