# Persistence and replay

Freewill stores versioned world documents rather than browser or renderer objects.

## Storage layers

- PostgreSQL is the primary store in the Docker stack.
- IndexedDB is an offline fallback and browser backup.
- JSON import/export uses the same validation boundary.
- Brain checkpoints live in a separate service volume and use safe tensor/JSON formats.

## Historical data

Current world state remains compact. Bounded decisions, events, and checkpoints are stored separately for inspection and replay. Replay restores verified checkpoints, applies recorded history without calling a provider, and never mutates the live world.

Historical mode is intentionally read-only. Returning to the present restores the live snapshot.

Persisted-schema changes require a migration, validation tests, and a complete round trip through browser and server storage. See [Data models](../reference/data-models.md) and [Versioning](../reference/versioning.md).

