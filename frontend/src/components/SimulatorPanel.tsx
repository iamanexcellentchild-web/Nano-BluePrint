import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { pascal } from '../names';
import { useStore } from '../store';
import type { SimResult } from '../types';

const SAMPLE: Record<string, unknown> = { string: '', text: '', integer: 0, number: 0, boolean: false, date: '', datetime: '' };

export function SimulatorPanel() {
  const { nodes, toDiagram, setTrace, notify } = useStore();
  const events = useMemo(
    () => nodes.filter((n) => n.data.blockType === 'event' && n.data.config.name).map((n) => n.data.config as { name: string; entity?: string }),
    [nodes],
  );
  const [event, setEvent] = useState('');
  const [payload, setPayload] = useState('{}');
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);

  const current = events.find((e) => e.name === event) ?? events[0];
  useEffect(() => { if (!event && events[0]) setEvent(events[0].name); }, [events, event]);

  const prefill = () => {
    const entity = current?.entity
      ? nodes.find((n) => n.data.blockType === 'entity' && pascal(String(n.data.config.name)) === pascal(current.entity!))
      : undefined;
    const fields = (entity?.data.config.fields as { name: string; type: string }[] | undefined) ?? [];
    setPayload(JSON.stringify(Object.fromEntries(fields.map((f) => [f.name, SAMPLE[f.type] ?? ''])), null, 2));
  };

  const run = async () => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(payload || '{}'); } catch { notify('Payload is not valid JSON'); return; }
    setBusy(true);
    try {
      const r = await api.simulate(toDiagram(), current.name, parsed);
      setResult(r); setTrace(r);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Simulation failed');
    } finally { setBusy(false); }
  };

  if (!events.length) return <p className="hint">Add an Event block to simulate it.</p>;
  return (
    <div className="sim">
      <label>Event
        <select value={current?.name} onChange={(e) => { setEvent(e.target.value); setResult(null); setTrace(null); }}>
          {events.map((e) => <option key={e.name}>{e.name}</option>)}
        </select>
      </label>
      <label>Sample record / data <button className="link" onClick={prefill}>fill from table</button>
        <textarea rows={6} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
      </label>
      <button className="primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run simulation'}</button>
      {result && (
        <>
          <ol className="trace">{result.trace.map((t, i) => <li key={i}><span>{t.summary}</span></li>)}</ol>
          <h4>Result</h4>
          <pre>{JSON.stringify(result.context, null, 2)}</pre>
          <button className="link" onClick={() => { setResult(null); setTrace(null); }}>Clear highlight</button>
        </>
      )}
    </div>
  );
}
