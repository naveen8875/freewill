import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface BrainGatewayOptions {
  serviceUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Local brain request exceeds 4 MB.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createBrainGateway(options: BrainGatewayOptions = {}) {
  const serviceUrl = (options.serviceUrl ?? process.env.BRAIN_SERVICE_URL ?? "http://127.0.0.1:8008").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://freewill.local");
    if (!url.pathname.startsWith("/api/brain/")) return next();
    const suffix = url.pathname.slice("/api/brain".length);
    const staticGet = suffix === "/health";
    const brainGet = /^\/brains\/[^/]+$/.test(suffix);
    const staticPost = new Set(["/episodes", "/decide-batch", "/experience-batch", "/evolution/jobs", "/evolution/analyze"]).has(suffix);
    const episodePost = /^\/episodes\/[^/]+\/(checkpoint|finish)$/.test(suffix);
    const brainPost = /^\/brains\/[^/]+\/clone$/.test(suffix);
    if (!(staticGet || brainGet || staticPost || episodePost || brainPost)) return send(response, 404, { error: "Local brain route not found." });
    if ((staticGet || brainGet) && request.method !== "GET" || (staticPost || episodePost || brainPost) && request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
    try {
      const body = request.method === "POST" ? await readBody(request) : undefined;
      const upstream = await fetchImpl(`${serviceUrl}/v1${suffix}`, {
        method: request.method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(options.token ?? process.env.FREEWILL_BRAIN_TOKEN ? { Authorization: `Bearer ${options.token ?? process.env.FREEWILL_BRAIN_TOKEN}` } : {}),
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(suffix.startsWith("/evolution/") ? 120_000 : 15_000),
      });
      const text = await upstream.text();
      response.statusCode = upstream.status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(text || JSON.stringify({ status: upstream.ok ? "ok" : "error" }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Local brain service failed.";
      return send(response, message.includes("exceeds") ? 413 : 503, { error: message.slice(0, 500), service: "local-brain" });
    }
  };
}

