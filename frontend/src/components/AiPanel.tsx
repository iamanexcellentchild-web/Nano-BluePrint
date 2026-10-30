import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { diffDiagrams } from '../diff';
import type { AiResult } from '../types';

export function AiPanel() {
  const { toDiagram, applyProposal, undo, history, notify } = useStore();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (mode: 'explain' | 'suggest') => {
    setBusy(true); setResult(null);
    try { setResult(await api.ai(mode, toDiagram(), question)); }
    catch (e) { notify(e instanceof Error ? e.message : 'AI request failed'); }
    finally { setBusy(false); }
  };

  const diff = result?.mode === 'suggest' && result?.proposed_diagram
    ? diffDiagrams(toDiagram(), result.proposed_diagram)
    : [];

  return (
    <div className="ai">
      <p className="hint">The assistant edits the diagram, never the code. You approve every change.</p>
      <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder="Optional: e.g. 'What happens if payment fails?'" />
      <div className="row">
        <button disabled={busy} onClick={() => ask('explain')}>Explain this</button>
        <button className="primary" disabled={busy} onClick={() => ask('suggest')}>Review &amp; suggest</button>
      </div>
      {busy && <p className="hint">Thinking…</p>}
      {result?.mode === 'explain' && <div className="ai__text">{result.text}</div>}
      {result?.mode === 'suggest' && (
        <div className="ai__text">
          <p>{result.summary || 'No changes suggested.'}</p>
          {diff.length > 0 && (
            <div className="ai__diff">
              <p className="ai__diff-title">Changes to apply:</p>
              <ul>
                {diff.map((change, i) => <li key={i}>{change}</li>)}
              </ul>
            </div>
          )}
          {result.proposed_diagram && (
            <div className="row">
              <button className="primary" onClick={() => { applyProposal(result.proposed_diagram!); setResult(null); }}>Apply to canvas</button>
              <button onClick={() => setResult(null)}>Dismiss</button>
            </div>
          )}
        </div>
      )}
      {history.length > 0 && <button className="link" onClick={undo}>Undo last AI change</button>}
    </div>
  );
}
