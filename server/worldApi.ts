import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { parseWorldDocument, type WorldDocument } from "../src/persistence/worldDocument.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const MAX_WORLD_BYTES = 32 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WorldRow {
  id: string;
  name: string;
  preset_id: string;
  seed: number;
  created_at_ms: string | number;
  updated_at_ms: string | number;
  document?: WorldDocument;
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_WORLD_BYTES) throw new Error("World document exceeds 32 MB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function summary(row: WorldRow) {
  return {
    id: row.id,
    name: row.name,
    presetId: row.preset_id,
    seed: row.seed,
    createdAt: Number(row.created_at_ms),
    updatedAt: Number(row.updated_at_ms),
  };
}

function worldId(pathname: string) {
  const match = pathname.match(/^\/api\/worlds\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return UUID_PATTERN.test(id) ? id : "invalid";
}

export interface WorldApiOptions {
  pool: Pool | null;
  databaseDashboardUrl?: string;
}

export function createWorldApiMiddleware(options: WorldApiOptions) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://freewill.local");
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) return next();

    if (pathname === "/api/health/live") return send(response, 200, { status: "ok" });
    if (pathname === "/api/health/ready") {
      if (!options.pool) return send(response, 503, { status: "not-ready", database: "not-configured" });
      try {
        await options.pool.query("SELECT 1");
        return send(response, 200, { status: "ready", database: "postgres" });
      } catch {
        return send(response, 503, { status: "not-ready", database: "unreachable" });
      }
    }

    if (pathname === "/api/status" && request.method === "GET") {
      if (!options.pool) return send(response, 200, { storage: "browser", database: { configured: false, reachable: false, schemaVersion: null, worlds: 0 } });
      try {
        const result = await options.pool.query<{ worlds: string; world_decisions: string; world_events: string; world_checkpoints: string; database_bytes: string }>(`
          SELECT
            (SELECT count(*) FROM worlds)::text AS worlds,
            (SELECT count(*) FROM world_decisions)::text AS world_decisions,
            (SELECT count(*) FROM world_events)::text AS world_events,
            (SELECT count(*) FROM world_checkpoints)::text AS world_checkpoints,
            pg_database_size(current_database())::text AS database_bytes
        `);
        const row = result.rows[0];
        return send(response, 200, {
          storage: "postgres",
          database: { configured: true, reachable: true, schemaVersion: DATABASE_SCHEMA_VERSION, worlds: Number(row.worlds), bytes: Number(row.database_bytes), history: { decisions: Number(row.world_decisions), events: Number(row.world_events), checkpoints: Number(row.world_checkpoints) } },
          dashboardUrl: options.databaseDashboardUrl,
        });
      } catch (cause) {
        return send(response, 503, { error: cause instanceof Error ? cause.message : "PostgreSQL status failed." });
      }
    }

    if (!options.pool && pathname.startsWith("/api/worlds")) return send(response, 503, { error: "PostgreSQL storage is not configured." });
    if (!options.pool) return send(response, 404, { error: "API route not found." });

    try {
      if (pathname === "/api/worlds" && request.method === "GET") {
        const result = await options.pool.query<WorldRow>(`
          SELECT id, name, preset_id, seed,
            (extract(epoch FROM created_at) * 1000)::bigint AS created_at_ms,
            (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_ms
          FROM worlds ORDER BY updated_at DESC LIMIT 500
        `);
        return send(response, 200, { worlds: result.rows.map(summary) });
      }

      const id = worldId(pathname);
      if (id === "invalid") return send(response, 400, { error: "World ID must be a UUID." });
      if (id && request.method === "GET") {
        const result = await options.pool.query<WorldRow>(`
          SELECT id, name, preset_id, seed, document,
            (extract(epoch FROM created_at) * 1000)::bigint AS created_at_ms,
            (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_ms
          FROM worlds WHERE id = $1
        `, [id]);
        const row = result.rows[0];
        if (!row?.document) return send(response, 404, { error: "World not found." });
        const document = structuredClone(row.document);
        if (document.simulation) {
          const [decisionRows, eventRows, checkpointRows] = await Promise.all([
            options.pool.query<{ record: WorldDocument["simulation"] extends infer _ ? unknown : never }>("SELECT record FROM world_decisions WHERE world_id = $1 ORDER BY tick DESC, decision_id DESC LIMIT 1000", [id]),
            options.pool.query<{ record: unknown }>("SELECT record FROM world_events WHERE world_id = $1 ORDER BY tick DESC, event_id DESC LIMIT 5000", [id]),
            options.pool.query<{ tick: number; digest: string; state: unknown }>("SELECT tick, digest, state FROM world_checkpoints WHERE world_id = $1 ORDER BY tick DESC LIMIT 64", [id]),
          ]);
          const legacyDecisions = document.simulation.decisions ?? [];
          const decisions = [...decisionRows.rows.map((item) => item.record), ...legacyDecisions] as typeof legacyDecisions;
          document.simulation.decisions = [...new Map(decisions.map((item) => [item.id, item])).values()]
            .sort((left, right) => right.tick - left.tick || right.id.localeCompare(left.id)).slice(0, 1_000);
          const legacyEvents = document.simulation.events ?? [];
          const events = [...eventRows.rows.map((item) => item.record), ...legacyEvents] as typeof legacyEvents;
          document.simulation.events = [...new Map(events.map((item) => [item.id, item])).values()]
            .sort((left, right) => right.tick - left.tick || right.id.localeCompare(left.id)).slice(0, 5_000);
          const legacyCheckpoints = document.simulation.checkpoints ?? [];
          const checkpoints = [...checkpointRows.rows.map((item) => ({ tick: item.tick, digest: item.digest, state: item.state })), ...legacyCheckpoints] as typeof legacyCheckpoints;
          document.simulation.checkpoints = [...new Map(checkpoints.map((item) => [item.tick, item])).values()]
            .sort((left, right) => left.tick - right.tick).slice(-64);
        }
        return send(response, 200, { world: { ...summary(row), document } });
      }

      if (id && request.method === "PUT") {
        const input = await readJson(request);
        if (!input || typeof input !== "object" || !("document" in input)) return send(response, 400, { error: "A world document is required." });
        const document = parseWorldDocument((input as { document: unknown }).document);
        const storedDocument = structuredClone(document);
        const decisions = storedDocument.simulation?.decisions ?? [];
        const events = storedDocument.simulation?.events ?? [];
        const checkpoints = storedDocument.simulation?.checkpoints ?? [];
        if (storedDocument.simulation) {
          storedDocument.simulation.decisions = [];
          storedDocument.simulation.events = [];
          storedDocument.simulation.checkpoints = [];
        }
        const requestedCreatedAt = "createdAt" in input && Number.isFinite((input as { createdAt?: unknown }).createdAt) ? Number((input as { createdAt: number }).createdAt) : Date.now();
        const client = await options.pool.connect();
        try {
          await client.query("BEGIN");
          const result = await client.query<WorldRow>(`
            INSERT INTO worlds (id, name, preset_id, seed, schema_version, document, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0), now())
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              preset_id = EXCLUDED.preset_id,
              seed = EXCLUDED.seed,
              schema_version = EXCLUDED.schema_version,
              document = EXCLUDED.document,
              updated_at = now()
            RETURNING id, name, preset_id, seed, document,
              (extract(epoch FROM created_at) * 1000)::bigint AS created_at_ms,
              (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_ms
          `, [id, document.config.name, document.config.presetId, document.config.seed, document.schemaVersion, JSON.stringify(storedDocument), requestedCreatedAt]);
          if (decisions.length) await client.query(`
            INSERT INTO world_decisions (world_id, decision_id, tick, record)
            SELECT $1, item->>'id', (item->>'tick')::integer, item
            FROM jsonb_array_elements($2::jsonb) AS item
            ON CONFLICT (world_id, decision_id) DO UPDATE SET tick = EXCLUDED.tick, record = EXCLUDED.record
          `, [id, JSON.stringify(decisions)]);
          if (events.length) await client.query(`
            INSERT INTO world_events (world_id, event_id, tick, record)
            SELECT $1, item->>'id', (item->>'tick')::integer, item
            FROM jsonb_array_elements($2::jsonb) AS item
            ON CONFLICT (world_id, event_id) DO NOTHING
          `, [id, JSON.stringify(events)]);
          if (checkpoints.length) await client.query(`
            INSERT INTO world_checkpoints (world_id, tick, digest, state)
            SELECT $1, (item->>'tick')::integer, item->>'digest', item->'state'
            FROM jsonb_array_elements($2::jsonb) AS item
            ON CONFLICT (world_id, tick) DO UPDATE SET digest = EXCLUDED.digest, state = EXCLUDED.state
          `, [id, JSON.stringify(checkpoints)]);
          await client.query("DELETE FROM world_decisions WHERE world_id = $1 AND decision_id NOT IN (SELECT decision_id FROM world_decisions WHERE world_id = $1 ORDER BY tick DESC, decision_id DESC LIMIT 1000)", [id]);
          await client.query("DELETE FROM world_events WHERE world_id = $1 AND event_id NOT IN (SELECT event_id FROM world_events WHERE world_id = $1 ORDER BY tick DESC, event_id DESC LIMIT 5000)", [id]);
          await client.query("DELETE FROM world_checkpoints WHERE world_id = $1 AND tick NOT IN (SELECT tick FROM world_checkpoints WHERE world_id = $1 ORDER BY tick DESC LIMIT 64)", [id]);
          await client.query("COMMIT");
          const row = result.rows[0];
          return send(response, 200, { world: { ...summary(row), document } });
        } catch (cause) {
          await client.query("ROLLBACK");
          throw cause;
        } finally {
          client.release();
        }
      }

      if (id && request.method === "DELETE") {
        const deleted = await options.pool.query("DELETE FROM worlds WHERE id = $1", [id]);
        return send(response, deleted.rowCount ? 200 : 404, deleted.rowCount ? { deleted: id } : { error: "World not found." });
      }

      if (pathname.startsWith("/api/worlds")) return send(response, 405, { error: "Method not allowed." });
      return send(response, 404, { error: "API route not found." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "World storage failed.";
      return send(response, message.includes("exceeds") ? 413 : message.includes("JSON") || message.includes("document") || message.includes("schema") ? 400 : 500, { error: message.slice(0, 500) });
    }
  };
}
