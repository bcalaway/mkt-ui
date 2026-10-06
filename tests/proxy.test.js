import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// A stand-in for mkt-api: echoes the path and query it was asked for.
let fake;
let app;

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    if (req.url.startsWith("/api/instruments/NOPE")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ detail: "no instrument named 'NOPE'" }));
    }
    const cache = req.url.startsWith("/api/bars") ? { "cache-control": "private, max-age=86400" } : {};
    res.writeHead(200, { "content-type": "application/json", "server-timing": "api;dur=5.0, upstream;dur=4.0", ...cache });
    res.end(JSON.stringify({ url: req.url }));
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  vi.resetModules();
  vi.stubEnv("MKT_API_URL", `http://127.0.0.1:${fake.address().port}`);
  ({ createApp: app } = await import("../server/index.js"));
  app = app();
});

afterAll(() => {
  vi.unstubAllEnvs();
  fake.close();
});

describe("the /api proxy to mkt-api", () => {
  it("passes the path and query through", async () => {
    const res = await request(app).get("/api/series?name=UST-2Y-CMT&name=UST-10Y-CMT&start=2026-01-01");
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("/api/series?name=UST-2Y-CMT&name=UST-10Y-CMT&start=2026-01-01");
    expect(res.headers["server-timing"]).toMatch(/^api;dur=5\.0, upstream;dur=4\.0, proxy;dur=[\d.]+$/);
  });

  it("passes mkt-api's Cache-Control through", async () => {
    const res = await request(app).get("/api/bars?series=UST-10Y-CMT&interval=month&block=1990");
    expect(res.headers["cache-control"]).toBe("private, max-age=86400");
  });

  it("passes mkt-api's errors through", async () => {
    const res = await request(app).get("/api/instruments/NOPE");
    expect(res.status).toBe(404);
    expect(res.body.detail).toMatch(/NOPE/);
  });

  it("answers 502 when mkt-api doesn't", async () => {
    vi.resetModules();
    vi.stubEnv("MKT_API_URL", "http://127.0.0.1:1");
    const { createApp } = await import("../server/index.js");
    const res = await request(createApp()).get("/api/instruments");
    expect(res.status).toBe(502);
    expect(res.body.detail).toMatch(/mkt-api didn't answer/);
  });
});
