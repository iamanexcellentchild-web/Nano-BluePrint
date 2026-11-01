import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realApi as api, ApiError, getToken, setToken } from "@/lib/api";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("stores and clears the token", () => {
    setToken("  abc  ");
    expect(getToken()).toBe("abc");
    setToken("   ");
    expect(getToken()).toBe("");
  });

  it("sends the token and parses JSON", async () => {
    let auth = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>)["Authorization"] ?? "";
      return reply([{ id: 1 }]);
    });
    setToken("t0ken");
    expect(await api.projects()).toEqual([{ id: 1 }]);
    expect(auth).toBe("Token t0ken");
  });

  it("explains a 401 in terms of Settings", async () => {
    vi.stubGlobal("fetch", async () => reply({ detail: "nope" }, 401));
    const err = await api.library().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/Settings/);
  });

  it("carries validation issues on errors", async () => {
    const issues = [{ level: "error", code: "X", message: "bad", node_id: null, edge_id: null }];
    vi.stubGlobal("fetch", async () => reply({ detail: "Fix errors first", issues }, 400));
    const err = (await api.generate({ name: "n", nodes: [], edges: [] }, "fastapi").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.message).toBe("Fix errors first");
    expect(err.issues).toEqual(issues);
  });

  it("reports an unreachable backend plainly", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = (await api.templates().catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/backend running/);
  });

  it("uses the AI endpoint only when asked", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response("zip");
    });
    const d = { name: "n", nodes: [], edges: [] };
    await api.generate(d, "django");
    await api.generate(d, "django", true);
    expect(urls).toEqual(["/api/generate/", "/api/generate/ai/"]);
  });
});
