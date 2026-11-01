import { beforeEach, describe, expect, it } from "vitest";
import { demoApi } from "@/lib/demo/backend";
import { TEMPLATE_LIST, templateDiagram } from "@/lib/demo/templates";

beforeEach(() => localStorage.clear());

describe("demo backend", () => {
  it("serves a block library whose connection rules reference real categories", async () => {
    const lib = await demoApi.library();
    const cats = Object.keys(lib.categories);
    expect(lib.blocks.length).toBeGreaterThan(5);
    for (const [a, b] of lib.allowed_connections) {
      expect(cats).toContain(a);
      expect(cats).toContain(b);
    }
  });

  it.each(TEMPLATE_LIST.map((t) => t.id))("template %s has no errors and simulates", async (id) => {
    const diagram = templateDiagram(id)!;
    const { issues, has_errors } = await demoApi.validate(diagram);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(has_errors).toBe(false);

    const ev = diagram.nodes.find((n) => n.type === "event")!;
    const sim = await demoApi.simulate(diagram, String(ev.config["name"]), {
      total: 20000, phone: "0801", stock: 2, supplier_email: "a@b.c", name: "Rice", client_name: "Ada", starts_at: "9am",
    });
    expect(sim.ok).toBe(true);
    expect(sim.trace.length).toBeGreaterThan(1);
  });

  it("takes the right branch", async () => {
    const d = templateDiagram("online-shop")!;
    const big = await demoApi.simulate(d, "order_placed", { total: 50000, phone: "0801" });
    const small = await demoApi.simulate(d, "order_placed", { total: 500, phone: "0801" });
    expect(big.context["status"]).toBe("paid");
    expect(small.context["status"]).toBe("pending_review");
  });

  it("reports validation problems", async () => {
    const d = templateDiagram("online-shop")!;
    d.edges.push({ id: "bad", source: "ev", target: "customer", source_handle: null });
    const { issues } = await demoApi.validate(d);
    expect(issues.some((i) => i.code === "DG004")).toBe(true);
    await expect(demoApi.generate(d, "fastapi")).rejects.toMatchObject({ status: 400 });
  });

  it("creates, saves and reopens projects", async () => {
    const p = await demoApi.createProject("Shop", "online-shop");
    expect((await demoApi.latest(p.id)).number).toBe(1);
    const d = (await demoApi.latest(p.id)).diagram;
    d.name = "Shop v2";
    expect((await demoApi.saveVersion(p.id, d)).number).toBe(2);
    const list = await demoApi.projects();
    expect(list[0]).toMatchObject({ id: p.id, name: "Shop v2", latest_version: 2 });
    await expect(demoApi.latest(999)).rejects.toMatchObject({ status: 404 });
  });

  it.each(["fastapi", "django", "express"])("generates a zip for %s", async (target) => {
    const blob = await demoApi.generate(templateDiagram("online-shop")!, target);
    const buf = await new Promise<ArrayBuffer>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blob);
    });
    const head = new Uint8Array(buf).slice(0, 4);
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("AI suggestions never add errors and can be applied", async () => {
    const d = templateDiagram("online-shop")!;
    const r = await demoApi.ai("suggest", d, "Add a failed payment path");
    expect(r.proposed_diagram).toBeDefined();
    expect(r.issues_after?.filter((i) => i.level === "error")).toEqual([]);
    expect((await demoApi.ai("explain", d, "")).text).toMatch(/Online shop/);
  });
});
