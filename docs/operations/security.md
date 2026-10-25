# Deployment security

The default Compose configuration binds PostgreSQL, Adminer, and the local brain port to loopback. The app port is reachable on the host network.

## Before public exposure

- Put the app behind an HTTPS reverse proxy.
- Add authentication and world/experiment ownership checks.
- Generate unique PostgreSQL and brain-service secrets.
- Keep database and dashboard ports on a private network.
- Rate-limit brain and experiment endpoints.
- Add request-size, execution-time, and concurrency limits.
- Run containers with explicit CPU and memory limits.
- Back up PostgreSQL and brain volumes.
- Rotate service credentials and remove them from shell history and support bundles.
- Review telemetry and exported worlds for data you do not intend to share.

The repository contains no anonymous multi-user authorization layer. Treating the default stack as a public SaaS would cross its documented security boundary.

Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

