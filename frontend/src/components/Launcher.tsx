import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProjectSummary, TemplateSummary } from '../types';

interface Props {
  onOpen: (projectId: number) => void;
  onClose?: () => void;
}

export function Launcher({ onOpen, onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState('My project');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.templates(), api.projects()])
      .then(([t, p]) => { setTemplates(t); setProjects(p); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const create = async (template: string) => {
    try { onOpen((await api.createProject(name.trim() || 'Untitled', template)).id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create project'); }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__card">
        <header>
          <h2>Start a project</h2>
          {onClose && <button className="icon" onClick={onClose} aria-label="Close">×</button>}
        </header>
        {error && <p className="error">{error}</p>}
        <label>Project name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="cards">
          {templates.map((t) => (
            <button key={t.id} className="card" onClick={() => create(t.id)}>
              <strong>{t.name}</strong><span>{t.description}</span>
            </button>
          ))}
          <button className="card card--blank" onClick={() => create('')}>
            <strong>Blank canvas</strong><span>Start from nothing.</span>
          </button>
        </div>
        {projects.length > 0 && (
          <>
            <h3>Open an existing project</h3>
            <ul className="projects">
              {projects.map((p) => (
                <li key={p.id}><button className="link" onClick={() => onOpen(p.id)}>{p.name}</button>
                  <span> v{p.latest_version ?? 0} · {new Date(p.updated_at).toLocaleDateString()}</span></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
