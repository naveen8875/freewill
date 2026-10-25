# Security policy

Freewill is currently alpha software intended for a single local operator. The included Docker stack is not an anonymous public SaaS configuration.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting or security advisory feature instead of opening a public issue. Include reproduction steps, affected endpoints or files, expected impact, and any suggested mitigation.

Do not include API keys, database dumps, world exports containing private data, or provider responses containing credentials in an issue.

## Supported version

Security fixes are applied to the latest release and the `main` branch. Older alpha releases are not maintained separately.

## Deployment boundary

Before exposing Freewill beyond a trusted local network:

- put the app behind HTTPS;
- generate strong database and brain-service credentials;
- keep PostgreSQL and Adminer private;
- add authentication and per-user world ownership;
- rate-limit decision and experiment endpoints;
- isolate untrusted workloads and set resource limits;
- configure backups and secret rotation.

See [deployment security](docs/operations/security.md) for the complete checklist.

