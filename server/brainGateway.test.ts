import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createBrainGateway } from "./brainGateway";

function response() {
  const result = { statusCode: 200, headers: {} as Record<string, string>, body: "", setHeader(key: string, value: string) { this.headers[key] = value; }, end(value = "") { this.body += value; } };
  return result;
}

describe("brain gateway", () => {
  it("keeps the service address server-side and forwards allowed batches", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "ready" }), { status: 200 }));
    const middleware = createBrainGateway({ serviceUrl: "http://brain.internal:8008", token: "secret", fetchImpl: fetchImpl as typeof fetch });
    const request = Readable.from([JSON.stringify({ hello: "world" })]) as unknown as Parameters<typeof middleware>[0];
    Object.assign(request, { url: "/api/brain/decide-batch", method: "POST" });
    const output = response();
    await middleware(request, output as never, () => { throw new Error("unexpected next"); });
    expect(output.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith("http://brain.internal:8008/v1/decide-batch", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secret" }) }));
  });

  it("allows lifecycle routes but rejects arbitrary upstream paths", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ artifactHash: "abc" }), { status: 200 }));
    const middleware = createBrainGateway({ serviceUrl: "http://brain.internal:8008", fetchImpl: fetchImpl as typeof fetch });
    const lifecycle = Readable.from([JSON.stringify({ saveCheckpoint: true })]) as unknown as Parameters<typeof middleware>[0];
    Object.assign(lifecycle, { url: "/api/brain/episodes/episode-1/finish", method: "POST" });
    const allowed = response();
    await middleware(lifecycle, allowed as never, () => { throw new Error("unexpected next"); });
    expect(allowed.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith("http://brain.internal:8008/v1/episodes/episode-1/finish", expect.anything());

    const rejected = Readable.from([]) as unknown as Parameters<typeof middleware>[0];
    Object.assign(rejected, { url: "/api/brain/admin/delete-all", method: "POST" });
    const denied = response();
    await middleware(rejected, denied as never, () => { throw new Error("unexpected next"); });
    expect(denied.statusCode).toBe(404);
  });
});

