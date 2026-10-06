import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.js";

const app = createApp();

describe("server", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /login without configured auth", async () => {
    // No AUTHENTIK_CLIENT_ID/SECRET in the test environment -- confirms the
    // auth route responds cleanly instead of crashing when Authentik isn't
    // wired up yet.
    const res = await request(app).get("/login");
    expect(res.status).toBe(501);
  });

  it("serves the frontend for client-side routes", async () => {
    const res = await request(app).get("/instruments/UST-10Y-CMT");
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it("GET / serves the built frontend", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain('<div id="root">');
  });
});
