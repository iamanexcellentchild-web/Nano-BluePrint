import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Diagram, PublishedSchema, PublishedSchemaSummary } from '../types';

type Props = {
  mode: 'browse' | 'publish';
  diagram?: Diagram;
  onClose: () => void;
  onUse: (slug: string, name: string) => Promise<void>;
  onPublished: (title: string) => void;
};

const DOC_TEMPLATE = `## Overview
Describe what this schema is for and the workflow it supports.

## Data model
List the entities, important fields, foreign keys, and many-to-many relationships.

## How to use
Explain the key events, actions, and any setup or assumptions needed before generating code.`;

export function SchemaLibrary({ mode, diagram, onClose, onUse, onPublished }: Props) {
  const [schemas, setSchemas] = useState<PublishedSchemaSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [selected, setSelected] = useState<PublishedSchema | null>(null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState(diagram?.name ?? '');
  const [description, setDescription] = useState('');
  const [documentation, setDocumentation] = useState(DOC_TEMPLATE);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'browse') return;
    let active = true;
    const timer = window.setTimeout(() => {
      api.schemas(query)
        .then((items) => {
          if (!active) return;
          setSchemas(items);
          setSelectedSlug((current) => items.some((item) => item.slug === current) ? current : (items[0]?.slug ?? ''));
        })
        .catch((e: Error) => { if (active) setError(e.message); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mode, query]);

  useEffect(() => {
    if (mode !== 'browse' || !selectedSlug) {
      setSelected(null);
      return;
    }
    let active = true;
    api.schema(selectedSlug)
      .then((schema) => { if (active) setSelected(schema); })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [mode, selectedSlug]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!diagram) return;
    setBusy(true);
    setError(null);
    try {
      await api.publishSchema({ title, description, documentation, diagram });
      onPublished(title.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish schema');
    } finally {
      setBusy(false);
    }
  };

  const useSelected = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onUse(selected.slug, projectName.trim() || selected.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use schema');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="schema-dialog-title">
      <div className={`modal__card schema-dialog${mode === 'browse' ? ' schema-dialog--browse' : ''}`}>
        <header>
          <div>
            <h2 id="schema-dialog-title">{mode === 'browse' ? 'Community schema library' : 'Publish this schema'}</h2>
            <p className="hint">
              {mode === 'browse'
                ? 'Explore reusable diagrams, read their documentation, and start a project from one.'
                : 'Publish the current diagram with clear documentation so others can understand and reuse it.'}
            </p>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">×</button>
        </header>
        {error && <p className="error" role="alert">{error}</p>}

        {mode === 'publish' ? (
          <form className="schema-publish" onSubmit={publish}>
            <label>Schema title
              <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={120} required />
            </label>
            <label>Short description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} minLength={20} maxLength={300}
                rows={3} placeholder="What problem does this schema solve?" required />
            </label>
            <label>Documentation (Markdown)
              <textarea value={documentation} onChange={(e) => setDocumentation(e.target.value)} minLength={60}
                maxLength={20000} rows={13} required />
            </label>
            <p className="hint">Document the entities, relationships, key workflow, and any assumptions. The published diagram is a snapshot; it will not change when you edit your project later.</p>
            <div className="row">
              <button type="button" onClick={onClose}>Cancel</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish schema'}</button>
            </div>
          </form>
        ) : (
          <>
            <label>Search schemas
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or description" />
            </label>
            <div className="schema-browser">
              <ul className="schema-browser__list">
                {schemas.map((schema) => (
                  <li key={schema.slug}>
                    <button className={`schema-entry${selectedSlug === schema.slug ? ' schema-entry--selected' : ''}`}
                      onClick={() => setSelectedSlug(schema.slug)}>
                      <strong>{schema.title}</strong>
                      <span>{schema.description}</span>
                      <small>By {schema.author} · Used {schema.use_count} times</small>
                    </button>
                  </li>
                ))}
                {!schemas.length && <li className="hint">No published schemas found.</li>}
              </ul>
              <section className="schema-detail">
                {selected ? (
                  <>
                    <h3>{selected.title}</h3>
                    <p>{selected.description}</p>
                    <p className="hint">By {selected.author} · {selected.diagram.nodes.length} blocks</p>
                    <h4>Documentation</h4>
                    <pre className="schema-docs">{selected.documentation}</pre>
                    <label>New project name
                      <input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                        placeholder={selected.title} maxLength={120} />
                    </label>
                    <button className="primary" onClick={useSelected} disabled={busy}>
                      {busy ? 'Creating project…' : 'Use this schema'}
                    </button>
                  </>
                ) : <p className="hint">Select a schema to read its documentation.</p>}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
