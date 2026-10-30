import type {
  AiResult, Diagram, Issue, Library, ProjectSummary, PublishedSchema, PublishedSchemaSummary,
  SimResult, TemplateSummary,
} from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: Issue[]) {
    super(message);
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('blueprint_token');
  if (token) h.Authorization = `Token ${token}`;
  return h;
}

async function fail(res: Response): Promise<never> {
  let detail = `Request failed (${res.status})`;
  let issues: Issue[] | undefined;
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') detail = body.detail;
    else if (body && typeof body === 'object') detail = JSON.stringify(body);
    issues = body.issues;
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401 || res.status === 403) detail = 'Not signed in. Set localStorage.blueprint_token (see README).';
  throw new ApiError(detail, res.status, issues);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: headers() });
  if (!res.ok) await fail(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  library: () => req<Library>('/blocks/'),
  templates: () => req<TemplateSummary[]>('/templates/'),
  projects: () => req<ProjectSummary[]>('/projects/'),
  createProject: (name: string, template: string) => req<ProjectSummary>('/projects/', post({ name, template })),
  schemas: (query = '') => req<PublishedSchemaSummary[]>(`/schemas/${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  schema: (slug: string) => req<PublishedSchema>(`/schemas/${encodeURIComponent(slug)}/`),
  publishSchema: (payload: Pick<PublishedSchema, 'title' | 'description' | 'documentation' | 'diagram'>) =>
    req<PublishedSchema>('/schemas/', post(payload)),
  useSchema: (slug: string, name: string) =>
    req<ProjectSummary>(`/schemas/${encodeURIComponent(slug)}/use/`, post({ name })),
  register: (username: string, password: string) =>
    req<{ detail: string }>('/auth/register/', post({ username, password })),
  login: (username: string, password: string) =>
    req<{ token: string }>('/auth/token/', post({ username, password })),
  latest: (id: number) => req<{ number: number; diagram: Diagram }>(`/projects/${id}/latest/`),
  saveVersion: (id: number, diagram: Diagram, note = '') =>
    req<{ number: number }>(`/projects/${id}/versions/`, post({ diagram, note })),
  validate: (diagram: Diagram) => req<{ issues: Issue[]; has_errors: boolean }>('/validate/', post({ diagram })),
  simulate: (diagram: Diagram, event: string, payload: Record<string, unknown>) =>
    req<SimResult>('/simulate/', post({ diagram, event, payload })),
  ai: (mode: 'explain' | 'suggest', diagram: Diagram, question: string) =>
    req<AiResult>('/ai/', post({ mode, diagram, question })),
  async generate(diagram: Diagram, target = 'fastapi'): Promise<Blob> {
    const res = await fetch('/api/generate/', { ...post({ diagram, target }), headers: headers() });
    if (!res.ok) await fail(res);
    return res.blob();
  },
  async generateAI(diagram: Diagram, target: string): Promise<Blob> {
    const res = await fetch('/api/generate/ai/', { ...post({ diagram, target }), headers: headers() });
    if (!res.ok) await fail(res);
    return res.blob();
  },
};
