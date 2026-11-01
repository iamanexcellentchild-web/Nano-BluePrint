// A complete in-browser stand-in for the Blueprint Django API (see docs/API.md).
// It is used while VITE_DEMO_MODE is not "false". Projects live in this browser's localStorage.
import { ApiError } from "../errors";
import type { AiResult, Diagram, Issue, Library, ProjectSummary, SimResult, TemplateSummary } from "../types";
import { explainResult, suggest } from "./ai";
import { simulate, validate } from "./engine";
import { generateFiles } from "./generate";
import { LIBRARY } from "./library";
import { TEMPLATE_LIST, templateDiagram } from "./templates";
import { makeZip } from "./zip";

interface StoredVersion {
  number: number;
  diagram: Diagram;
  note: string;
  created_at: string;
}
interface StoredProject {
  id: number;
  name: string;
  template: string;
  updated_at: string;
  versions: StoredVersion[];
}
interface Store {
  nextId: number;
  projects: StoredProject[];
}

const STORE_KEY = "blueprint-demo-projects";
const LATENCY = import.meta.env.MODE === "test" ? 0 : 120;
const pause = () => (LATENCY ? new Promise<void>((r) => setTimeout(r, LATENCY)) : Promise.resolve());

const read = (): Store => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (raw && typeof raw === "object" && Array.isArray((raw as Store).projects)) return raw as Store;
  } catch {
    /* corrupted: start fresh */
  }
  return { nextId: 1, projects: [] };
};
const write = (s: Store): void => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    throw new ApiError("Demo storage is full. Delete old projects or clear site data.", 507);
  }
};

const summary = (p: StoredProject): ProjectSummary => ({
  id: p.id,
  name: p.name,
  template: p.template,
  updated_at: p.updated_at,
  latest_version: p.versions.at(-1)?.number ?? null,
});

const find = (s: Store, id: number): StoredProject => {
  const p = s.projects.find((x) => x.id === id);
  if (!p) throw new ApiError("Project not found.", 404);
  return p;
};

export const demoApi = {
  library: async (): Promise<Library> => {
    await pause();
    return structuredClone(LIBRARY);
  },

  templates: async (): Promise<TemplateSummary[]> => {
    await pause();
    return structuredClone(TEMPLATE_LIST);
  },

  projects: async (): Promise<ProjectSummary[]> => {
    await pause();
    return read()
      .projects.map(summary)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  createProject: async (name: string, template: string): Promise<ProjectSummary> => {
    await pause();
    const start = template ? templateDiagram(template) : null;
    if (template && !start) throw new ApiError(`Unknown template “${template}”.`, 400);
    const store = read();
    const now = new Date().toISOString();
    const diagram: Diagram = start ?? { schema_version: "1", name, nodes: [], edges: [] };
    diagram.name = name;
    const project: StoredProject = {
      id: store.nextId++,
      name,
      template,
      updated_at: now,
      versions: [{ number: 1, diagram, note: template ? `From template ${template}` : "Blank", created_at: now }],
    };
    store.projects.push(project);
    write(store);
    return summary(project);
  },

  latest: async (id: number): Promise<{ number: number; diagram: Diagram }> => {
    await pause();
    const latest = find(read(), id).versions.at(-1);
    if (!latest) throw new ApiError("This project has no saved versions.", 404);
    return { number: latest.number, diagram: structuredClone(latest.diagram) };
  },

  saveVersion: async (id: number, diagram: Diagram, note = ""): Promise<{ number: number }> => {
    await pause();
    const store = read();
    const project = find(store, id);
    const number = (project.versions.at(-1)?.number ?? 0) + 1;
    const now = new Date().toISOString();
    project.versions.push({ number, diagram: structuredClone(diagram), note, created_at: now });
    project.name = diagram.name || project.name;
    project.updated_at = now;
    write(store);
    return { number };
  },

  validate: async (diagram: Diagram): Promise<{ issues: Issue[]; has_errors: boolean }> => {
    const issues = validate(diagram);
    return { issues, has_errors: issues.some((i) => i.level === "error") };
  },

  simulate: async (diagram: Diagram, event: string, payload: Record<string, unknown>): Promise<SimResult> => {
    await pause();
    return simulate(diagram, event, payload);
  },

  ai: async (mode: "explain" | "suggest", diagram: Diagram, question: string): Promise<AiResult> => {
    await pause();
    return mode === "explain" ? explainResult(diagram, question) : suggest(diagram, question);
  },

  generate: async (diagram: Diagram, target: string, ai = false): Promise<Blob> => {
    await pause();
    const issues = validate(diagram);
    if (issues.some((i) => i.level === "error")) {
      throw new ApiError("Fix the errors in the Checks tab before generating code.", 400, issues);
    }
    return makeZip(generateFiles(diagram, target, ai));
  },
};
