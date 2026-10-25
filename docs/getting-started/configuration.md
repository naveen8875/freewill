# Configuration

Copy `.env.example` to `.env`. The repository ignores `.env` and every `.env.*` file except the example.

The complete simulation and evolving-brain stack runs locally. Configure PostgreSQL, ports, brain-service threads, and the shared app-to-brain token as needed.

Never use a `VITE_` prefix for a secret. Vite exposes prefixed values to browser code; service credentials belong only in the server environment.

Database, port, brain-service, and operational settings are listed in the [environment-variable reference](../reference/environment-variables.md).

