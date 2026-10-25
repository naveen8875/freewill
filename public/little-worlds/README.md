# Little Worlds runtime

These browser scripts are the procedural Canvas2D art and animation runtime used by Freewill. They are application source, not the original design-reference export.

Authoritative simulation state lives in `src/sim/`. The runtime consumes snapshots through `src/renderer/` and must not decide citizen behavior, mutate inventories, advance needs, or complete actions.

The original design/prototype exports are intentionally excluded from Git and Docker.

