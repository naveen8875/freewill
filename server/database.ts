import { Pool, type PoolConfig } from "pg";

export const DATABASE_SCHEMA_VERSION = 6;

const migrations = [
  {
    version: 1,
    name: "world storage",
    sql: `
      CREATE TABLE IF NOT EXISTS freewill_schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS worlds (
        id uuid PRIMARY KEY,
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
        preset_id text NOT NULL CHECK (char_length(preset_id) BETWEEN 1 AND 160),
        seed integer NOT NULL,
        schema_version integer NOT NULL,
        document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS worlds_updated_at_idx ON worlds (updated_at DESC);
      CREATE INDEX IF NOT EXISTS worlds_name_idx ON worlds (lower(name));

    `,
  },
  {
    version: 2,
    name: "world lookup index",
    sql: "CREATE INDEX IF NOT EXISTS worlds_preset_idx ON worlds (preset_id, updated_at DESC);",
  },
  {
    version: 3,
    name: "world schema lookup index",
    sql: "CREATE INDEX IF NOT EXISTS worlds_schema_idx ON worlds (schema_version, updated_at DESC);",
  },
  {
    version: 4,
    name: "world seed lookup index",
    sql: "CREATE INDEX IF NOT EXISTS worlds_seed_idx ON worlds (seed);",
  },
  {
    version: 5,
    name: "Append-only world history and replay checkpoints",
    sql: `
      CREATE TABLE IF NOT EXISTS world_decisions (
        world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        decision_id text NOT NULL,
        tick integer NOT NULL CHECK (tick >= 0),
        record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, decision_id)
      );
      CREATE INDEX IF NOT EXISTS world_decisions_tick_idx ON world_decisions (world_id, tick DESC, decision_id);

      CREATE TABLE IF NOT EXISTS world_events (
        world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        event_id text NOT NULL,
        tick integer NOT NULL CHECK (tick >= 0),
        record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, event_id)
      );
      CREATE INDEX IF NOT EXISTS world_events_tick_idx ON world_events (world_id, tick DESC, event_id);

      CREATE TABLE IF NOT EXISTS world_checkpoints (
        world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        tick integer NOT NULL CHECK (tick >= 0),
        digest text NOT NULL,
        state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, tick)
      );
      CREATE INDEX IF NOT EXISTS world_checkpoints_tick_idx ON world_checkpoints (world_id, tick DESC);
    `,
  },
  {
    version: 6,
    name: "Local evolving brain experiments and lineage",
    sql: `
      CREATE TABLE IF NOT EXISTS brain_backbones (
        id text PRIMARY KEY,
        version text NOT NULL,
        architecture jsonb NOT NULL DEFAULT '{}'::jsonb,
        artifact_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS brain_genomes (
        id text PRIMARY KEY,
        backbone_id text,
        generation integer NOT NULL CHECK (generation >= 0),
        artifact_hash text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS brain_genomes_generation_idx ON brain_genomes (generation, created_at DESC);

      CREATE TABLE IF NOT EXISTS brain_lineage_edges (
        parent_id text NOT NULL,
        child_id text NOT NULL REFERENCES brain_genomes(id) ON DELETE CASCADE,
        mutation_kind text NOT NULL,
        magnitude double precision NOT NULL DEFAULT 0,
        generation integer NOT NULL CHECK (generation >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (parent_id, child_id)
      );
      CREATE INDEX IF NOT EXISTS brain_lineage_child_idx ON brain_lineage_edges (child_id);

      CREATE TABLE IF NOT EXISTS brain_lifetime_checkpoints (
        id text PRIMARY KEY,
        brain_id text NOT NULL,
        episode_id text NOT NULL,
        tick integer NOT NULL CHECK (tick >= 0),
        artifact_hash text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS learning_experiments (
        id text PRIMARY KEY,
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
        status text NOT NULL CHECK (status IN ('queued','running','completed','cancelled','failed')),
        config jsonb NOT NULL,
        progress jsonb NOT NULL DEFAULT '{}'::jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS learning_experiments_updated_idx ON learning_experiments (updated_at DESC);

      CREATE TABLE IF NOT EXISTS learning_generations (
        experiment_id text NOT NULL REFERENCES learning_experiments(id) ON DELETE CASCADE,
        generation integer NOT NULL CHECK (generation >= 0),
        summary jsonb NOT NULL,
        selected_brain_ids text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (experiment_id, generation)
      );

      CREATE TABLE IF NOT EXISTS learning_episodes (
        id text PRIMARY KEY,
        experiment_id text NOT NULL REFERENCES learning_experiments(id) ON DELETE CASCADE,
        generation integer NOT NULL CHECK (generation >= 0),
        cohort text NOT NULL,
        seed integer NOT NULL,
        status text NOT NULL CHECK (status IN ('running','completed','cancelled','failed')),
        result jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS learning_episodes_experiment_idx ON learning_episodes (experiment_id, generation, created_at);

      CREATE TABLE IF NOT EXISTS brain_episode_results (
        episode_id text NOT NULL REFERENCES learning_episodes(id) ON DELETE CASCADE,
        brain_id text NOT NULL,
        citizen_id integer NOT NULL,
        alive boolean NOT NULL,
        days_alive double precision NOT NULL,
        fitness jsonb NOT NULL,
        action_distribution jsonb NOT NULL,
        PRIMARY KEY (episode_id, brain_id)
      );

      CREATE TABLE IF NOT EXISTS brain_mutations (
        child_id text PRIMARY KEY REFERENCES brain_genomes(id) ON DELETE CASCADE,
        parent_id text,
        experiment_id text NOT NULL REFERENCES learning_experiments(id) ON DELETE CASCADE,
        generation integer NOT NULL CHECK (generation >= 0),
        mutation_kind text NOT NULL,
        magnitude double precision NOT NULL,
        seed bigint,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS learning_metric_series (
        experiment_id text NOT NULL REFERENCES learning_experiments(id) ON DELETE CASCADE,
        generation integer NOT NULL CHECK (generation >= 0),
        metric text NOT NULL,
        value double precision NOT NULL,
        context jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS learning_metric_series_idx ON learning_metric_series (experiment_id, generation, metric);
    `,
  },
] as const;

export function createDatabasePool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl && !process.env.PGHOST) return null;
  const config: PoolConfig = {
    ...(databaseUrl ? { connectionString: databaseUrl } : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    }),
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "freewill",
  };
  if (process.env.DATABASE_SSL === "require") config.ssl = { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" };
  const pool = new Pool(config);
  pool.on("error", (cause) => console.error("PostgreSQL pool error", cause));
  return pool;
}

export async function initializeDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(667_374_995)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS freewill_schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set<number>((await client.query<{ version: number }>("SELECT version FROM freewill_schema_migrations")).rows.map((row) => row.version));
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO freewill_schema_migrations (version, name) VALUES ($1, $2)", [migration.version, migration.name]);
    }
    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(pool: Pool, attempts = 30) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      await initializeDatabase(pool);
      return;
    } catch (cause) {
      lastError = cause;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, attempt * 100)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PostgreSQL did not become ready.");
}
