/** Backends the generator can emit. `id` is what the API expects. */
export const TARGETS = [
  { id: "fastapi", label: "FastAPI · PostgreSQL" },
  { id: "django", label: "Django · SQLite" },
  { id: "express", label: "Express · PostgreSQL" },
] as const;

export const DEFAULT_TARGET: string = TARGETS[0].id;
