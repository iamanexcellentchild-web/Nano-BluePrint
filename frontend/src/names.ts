// Mirrors blueprint_core/names.py so the UI can match tables to events the same way the backend does.
export const snake = (s: string): string =>
  s.trim().replace(/[\s-]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/_+/g, '_').toLowerCase();

export const pascal = (s: string): string =>
  snake(s).split('_').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
