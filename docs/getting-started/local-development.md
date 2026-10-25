# Local development

## Web and simulation

Requirements: Node.js 22+ and pnpm 11.25.0.

```bash
corepack enable
pnpm install
pnpm dev
```

Vite serves the project at `http://127.0.0.1:5173`. When `DATABASE_URL` is absent, world storage automatically falls back to IndexedDB.

## Optional PostgreSQL

Run only PostgreSQL when you want server-backed saves during Vite development:

```bash
docker compose up -d postgres
```

Use the `DATABASE_URL` in `.env.example`. Keep `FREEWILL_DEV_RECOVER_INTERRUPTED=false` when a Vite process and Docker share the database; the production experiment manager owns recovery.

## Optional local brain service

The easiest path is:

```bash
docker compose up -d --build brain
```

The service contract and direct Python workflow are documented in [`services/brain/README.md`](../../services/brain/README.md).

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e --project=chrome
```

The complete `pnpm test:e2e` command runs the configured browser projects. Benchmarks are opt-in because they measure performance rather than ordinary correctness.

