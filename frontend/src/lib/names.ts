// Mirrors blueprint_core/names.py so the UI matches tables to events the same way the backend does.
export const snake = (s: string): string =>
  s
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/_+/g, "_")
    .toLowerCase();

export const pascal = (s: string): string =>
  snake(s)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/** File-name friendly version of a project name. */
export const slug = (s: string, fallback = "project"): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
