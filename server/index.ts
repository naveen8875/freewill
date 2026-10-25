import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool, waitForDatabase } from "./database.js";
import { createWorldApiMiddleware } from "./worldApi.js";
import { createBrainGateway } from "./brainGateway.js";
import { ExperimentManager } from "./experimentManager.js";
import { createExperimentApi } from "./experimentApi.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const distRoot = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const pool = createDatabasePool();

if (!pool) throw new Error("DATABASE_URL is required for the production server.");
const database = pool;
await waitForDatabase(database);

const brain = createBrainGateway();
const experimentManager = new ExperimentManager(database);
await experimentManager.recoverInterrupted();
const experiments = createExperimentApi(experimentManager);
const api = createWorldApiMiddleware({
  pool: database,
  databaseDashboardUrl: process.env.DATABASE_DASHBOARD_URL,
});

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function securityHeaders(response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}

function serveStatic(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    return response.end("Method not allowed");
  }
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://freewill.local").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filePath = resolve(distRoot, requested);
  if (!filePath.startsWith(`${distRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) filePath = resolve(distRoot, "index.html");
  const extension = extname(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
  response.setHeader("Cache-Control", filePath.endsWith("index.html") ? "no-cache" : requested.startsWith("assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  if (request.method === "HEAD") return response.end();
  createReadStream(filePath).on("error", () => {
    if (!response.headersSent) response.statusCode = 500;
    response.end("Could not read application asset.");
  }).pipe(response);
}

const server = createServer((request, response) => {
  securityHeaders(response);
  void brain(request, response, () => {
    void experiments(request, response, () => {
      void api(request, response, () => serveStatic(request, response));
    });
  });
});

server.listen(port, host, () => console.info(`freewill listening on http://${host}:${port}`));

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down.`);
  server.close(async () => {
    await database.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
