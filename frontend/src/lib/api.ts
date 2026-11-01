import { ApiError } from "./errors";
import { demoApi } from "./demo/backend";
import type {
  AiResult,
  Diagram,
  Issue,
  Library,
  ProjectSummary,
  SimResult,
  TemplateSummary,
} from "./types";

// Dev: Vite proxies /api to Django, so the browser sees one origin.
// Deployed: set VITE_API_URL to the backend origin (no trailing slash needed).
const ORIGIN = String(import.meta.env["VITE_API_URL"] ?? "").replace(/\/+$/, "");
export const API_BASE = `${ORIGIN}/api`;

const TOKEN_KEY = "blueprint_token";
export const getToken = (): string => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (token: string): void => {
  const value = token.trim();
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
};

export { ApiError };

/**
 * Demo mode (the default) runs everything in the browser: no backend needed.
 * When the Django API is ready, set VITE_DEMO_MODE=false (see .env.example).
 */
export const DEMO_MODE = String(import.meta.env["VITE_DEMO_MODE"] ?? "true").toLowerCase() !== "false";

export const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) h["Authorization"] = `Token ${token}`;
  return h;
}

async function fail(res: Response): Promise<never> {
  if (res.status === 401 || res.status === 403) {
    throw new ApiError("Not signed in to the API. Open Settings and add your API token.", res.status);
  }
  let detail = `Request failed (${res.status})`;
  let issues: Issue[] | undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { detail?: unknown; issues?: Issue[] };
      detail = typeof b.detail === "string" ? b.detail : JSON.stringify(body);
      issues = b.issues;
    }
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(detail, res.status, issues);
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers: headers() });
  } catch {
    throw new ApiError("Can't reach the Blueprint API. Is the backend running?", 0);
  }
  if (!res.ok) await fail(res);
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** The real HTTP client. Exported separately so it can be tested while demo mode is on. */
export const realApi = {
  library: () => json<Library>("/blocks/"),
  templates: () => json<TemplateSummary[]>("/templates/"),
  projects: () => json<ProjectSummary[]>("/projects/"),
  createProject: (name: string, template: string) =>
    json<ProjectSummary>("/projects/", post({ name, template })),
  latest: (id: number) => json<{ number: number; diagram: Diagram }>(`/projects/${id}/latest/`),
  saveVersion: (id: number, diagram: Diagram, note = "") =>
    json<{ number: number }>(`/projects/${id}/versions/`, post({ diagram, note })),
  validate: (diagram: Diagram) =>
    json<{ issues: Issue[]; has_errors: boolean }>("/validate/", post({ diagram })),
  simulate: (diagram: Diagram, event: string, payload: Record<string, unknown>) =>
    json<SimResult>("/simulate/", post({ diagram, event, payload })),
  ai: (mode: "explain" | "suggest", diagram: Diagram, question: string) =>
    json<AiResult>("/ai/", post({ mode, diagram, question })),
  /** Downloads a generated project as a zip. `ai` also asks the AI provider to fill custom blocks. */
  generate: async (diagram: Diagram, target: string, ai = false): Promise<Blob> => {
    const res = await send(ai ? "/generate/ai/" : "/generate/", post({ diagram, target }));
    return res.blob();
  },
};

/** What the rest of the app imports. Same shape either way, so no component changes when you switch. */
export const api: typeof realApi = DEMO_MODE ? demoApi : realApi;
