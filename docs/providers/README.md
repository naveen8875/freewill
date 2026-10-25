# Decision policies

Every policy implements the same constrained boundary: receive a decision request containing opaque legal candidates and return one candidate identifier plus supported metadata.

- [Local evolving brains](local-evolving-brains.md)
- [Build a local decision policy](building-a-provider.md)

The deterministic Local lab is implemented in TypeScript and exists for offline play, fixtures, and reproducible controls.

Provider failures are visible and retried later. They do not activate a hidden fallback.

