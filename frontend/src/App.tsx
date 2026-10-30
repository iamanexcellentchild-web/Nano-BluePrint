import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow } from '@xyflow/react';
import { api } from './api';
import { logicSignature, useStore } from './store';
import { BlockNode, colorFor } from './components/BlockNode';
import { Palette } from './components/Palette';
import { Inspector } from './components/Inspector';
import { IssuesPanel } from './components/IssuesPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { AiPanel } from './components/AiPanel';
import { Launcher } from './components/Launcher';
import type { BlockNodeT } from './types';

const nodeTypes = { block: BlockNode }; // must be stable (module scope)
type Tab = 'inspect' | 'checks' | 'simulate' | 'ai';
const PROJECT_KEY = 'blueprint_project';

export function App() {
  const store = useStore();
  const { library, nodes, edges, issues, name, dirty, toast, projectId } = store;
  const { screenToFlowPosition } = useReactFlow();
  const [tab, setTab] = useState<Tab>('inspect');
  const [target, setTarget] = useState('fastapi');
  const [launcher, setLauncher] = useState(false);
  const [booted, setBooted] = useState(false);

  const openProject = useCallback(async (id: number) => {
    try {
      const v = await api.latest(id);
      store.loadDiagram(v.diagram);
      store.setProjectId(id);
      localStorage.setItem(PROJECT_KEY, String(id));
      setLauncher(false);
    } catch (e) {
      store.notify(e instanceof Error ? e.message : 'Could not open project');
      setLauncher(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boot: load block library, then reopen the last project or show the launcher.
  useEffect(() => {
    (async () => {
      try {
        store.setLibrary(await api.library());
        const saved = Number(localStorage.getItem(PROJECT_KEY));
        if (saved) await openProject(saved); else setLauncher(true);
      } catch (e) {
        store.notify(e instanceof Error ? e.message : 'Could not reach the API');
      } finally { setBooted(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live checks, debounced, only when the logic (not the layout) changes.
  const sig = useMemo(() => logicSignature(store.toDiagram()), [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!library) return;
    const t = setTimeout(() => {
      api.validate(store.toDiagram()).then((r) => store.setIssues(r.issues)).catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, library]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.notify(null), 4500);
    return () => clearTimeout(t);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    try {
      let id = useStore.getState().projectId;
      const st = useStore.getState();
      if (!id) {
        id = (await api.createProject(st.name || 'Untitled', '')).id;
        st.setProjectId(id);
        localStorage.setItem(PROJECT_KEY, String(id));
      }
      await api.saveVersion(id, st.toDiagram());
      st.markSaved();
      st.notify('Saved');
    } catch (e) {
      useStore.getState().notify(e instanceof Error ? e.message : 'Save failed');
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (useStore.getState().dirty) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, [save]);

  const download = async (withAI = false) => {
    try {
      const blob = withAI ? await api.generateAI(store.toDiagram(), target) : await api.generate(store.toDiagram(), target);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${target}${withAI ? '-ai' : ''}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      store.notify(e instanceof Error ? `Cannot generate: ${e.message}` : 'Generation failed');
      setTab('checks');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/blueprint-block');
    if (type) store.addBlock(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const categoryOf = (n: BlockNodeT) => library?.blocks.find((b) => b.type === n.data.blockType)?.category ?? '';

  // Selecting something that is not a block (e.g. from the checks list) jumps to the inspector.
  useEffect(() => { if (store.selectedId && tab === 'checks') setTab('inspect'); }, [store.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Blueprint</span>
        <input className="projname" value={name} onChange={(e) => store.setName(e.target.value)} aria-label="Project name" />
        <span className="status">
          {errors > 0 ? <b className="bad">{errors} error{errors > 1 ? 's' : ''}</b> : <span className="good">no errors</span>}
          {warnings > 0 && <> · {warnings} warning{warnings > 1 ? 's' : ''}</>}
          {dirty && <> · unsaved</>}
        </span>
        <span className="spacer" />
        <button onClick={() => setLauncher(true)}>Projects</button>
        <button onClick={save} disabled={!dirty && !!projectId}>Save</button>
        <select className="target-select" aria-label="Generated backend" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="fastapi">FastAPI · PostgreSQL</option>
          <option value="django">Django · SQLite</option>
          <option value="express">Express · PostgreSQL</option>
        </select>
        <button className="primary" onClick={() => download()} disabled={errors > 0} title={errors ? 'Fix errors first' : `Download a ${target} project`}>
          Generate code
        </button>
        <button onClick={() => download(true)} disabled={errors > 0} title="Send the diagram to the configured AI provider for custom-block implementations and a generation review">
          AI generate
        </button>
      </header>

      <Palette />

      <main className="canvas" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>
        <ReactFlow<BlockNodeT>
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={store.onNodesChange} onEdgesChange={store.onEdgesChange} onConnect={store.onConnect}
          isValidConnection={(c) => store.canConnect({ source: c.source, target: c.target, sourceHandle: c.sourceHandle })}
          onNodeClick={(_, n) => { store.select(n.id); setTab('inspect'); }}
          onPaneClick={() => store.select(null)}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          fitView minZoom={0.2}>
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => colorFor(library, categoryOf(n as BlockNodeT))} />
        </ReactFlow>
        {booted && nodes.length === 0 && !launcher && <div className="empty">Drag a block from the left, or open Projects to start from a template.</div>}
      </main>

      <aside className="side">
        <nav className="tabs" role="tablist">
          {([['inspect', 'Block'], ['checks', `Checks${issues.length ? ` (${issues.length})` : ''}`], ['simulate', 'Simulate'], ['ai', 'AI']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="side__body">
          {tab === 'inspect' && <Inspector />}
          {tab === 'checks' && <IssuesPanel />}
          {tab === 'simulate' && <SimulatorPanel />}
          {tab === 'ai' && <AiPanel />}
        </div>
      </aside>

      {launcher && <Launcher onOpen={openProject} onClose={projectId || nodes.length ? () => setLauncher(false) : undefined} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
