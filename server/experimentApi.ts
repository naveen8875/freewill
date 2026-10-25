import type { IncomingMessage, ServerResponse } from "node:http";
import type { LearningExperimentConfig } from "../src/experiments/types.js";
import type { ExperimentManager } from "./experimentManager.js";

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) throw new Error("Experiment request exceeds 256 KB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<LearningExperimentConfig>;
}

export function createExperimentApi(manager: ExperimentManager) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const requestUrl = new URL(request.url ?? "/", "http://freewill.local");
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith("/api/experiments")) return next();
    try {
      if (pathname === "/api/experiments" && request.method === "GET") return send(response, 200, { experiments: await manager.list() });
      if (pathname === "/api/experiments" && request.method === "POST") return send(response, 202, { experiment: await manager.create(await readJson(request)) });
      const lineage = pathname.match(/^\/api\/experiments\/([^/]+)\/lineage$/);
      if (lineage && ID_PATTERN.test(lineage[1]) && request.method === "GET") return send(response, 200, { lineage: await manager.lineage(lineage[1]) });
      const exported = pathname.match(/^\/api\/experiments\/([^/]+)\/export$/);
      if (exported && ID_PATTERN.test(exported[1]) && request.method === "GET") {
        const bundle = await manager.export(exported[1]);
        if (!bundle) return send(response, 404, { error: "Experiment not found." });
        response.setHeader("Content-Disposition", `attachment; filename=\"freewill-${exported[1]}.freewill-brain.json\"`);
        return send(response, 200, bundle);
      }
      const observatory = pathname.match(/^\/api\/experiments\/([^/]+)\/observatory$/);
      if (observatory && ID_PATTERN.test(observatory[1]) && request.method === "GET") {
        const tickValue = requestUrl.searchParams.get("tick");
        const tick = tickValue === null ? undefined : Number(tickValue);
        if (tick !== undefined && (!Number.isFinite(tick) || tick < 0)) return send(response, 400, { error: "Replay tick must be a non-negative number." });
        const payload = await manager.observatory(observatory[1], { episodeId: requestUrl.searchParams.get("episode") ?? undefined, tick });
        return send(response, payload ? 200 : 404, payload ?? { error: "Experiment not found." });
      }
      const match = pathname.match(/^\/api\/experiments\/([^/]+)(\/(?:cancel|retry))?$/);
      if (!match || !ID_PATTERN.test(match[1])) return send(response, 404, { error: "Experiment not found." });
      if (match[2] === "/cancel" && request.method === "POST") return send(response, await manager.cancel(match[1]) ? 200 : 404, { cancelled: match[1] });
      if (match[2] === "/retry" && request.method === "POST") {
        const experiment = await manager.retry(match[1]);
        return send(response, experiment ? 202 : 404, experiment ? { experiment } : { error: "Experiment not found." });
      }
      if (!match[2] && request.method === "GET") {
        const experiment = await manager.get(match[1]);
        return send(response, experiment ? 200 : 404, experiment ? { experiment } : { error: "Experiment not found." });
      }
      return send(response, 405, { error: "Method not allowed." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Experiment API failed.";
      const status = message.includes("already running") || message.includes("already starting")
        ? 409
        : message.includes("between") || message.includes("seed") || message.includes("dimension") || message.includes("JSON")
          ? 400
          : 500;
      return send(response, status, { error: message.slice(0, 500) });
    }
  };
}

