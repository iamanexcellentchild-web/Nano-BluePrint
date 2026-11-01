import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { countIssues } from "@/lib/diagram";
import { notify, notifyError } from "@/lib/notify";
import { useWorkspace } from "@/lib/store";
import type { AiResult } from "@/lib/types";

const PROMPTS = [
  "What happens if payment fails?",
  "What's missing before I generate?",
  "Add a failed payment path",
];

export function AiPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AiResult | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (mode: "explain" | "suggest") => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api.ai(mode, useWorkspace.getState().toDiagram(), question));
    } catch (e) {
      notifyError(e, "AI request failed");
    } finally {
      setBusy(false);
    }
  };

  const proposal = result?.proposed_diagram;
  const errorsAfter = result?.issues_after ? countIssues(result.issues_after, "error") : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The assistant edits the diagram, never the code. You approve every change.
      </p>
      <Textarea
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Optional: ask about this flow"
        aria-label="Ask Blueprint AI"
      />
      <div className="flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setQuestion(p)}
            className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void ask("explain")}>
          Explain this
        </Button>
        <Button disabled={busy} onClick={() => void ask("suggest")}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Review &amp; suggest
        </Button>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}

      {result?.mode === "explain" && (
        <div className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{result.text}</div>
      )}
      {result?.mode === "suggest" && (
        <div className="space-y-3 rounded-md bg-muted p-3 text-sm">
          <p>{result.summary || "No changes suggested."}</p>
          {proposal && (
            <>
              {errorsAfter !== null && (
                <p className="text-xs text-muted-foreground">
                  After applying: {errorsAfter === 0 ? "no errors" : `${errorsAfter} error(s)`}.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    useWorkspace.getState().applyProposal(proposal);
                    setResult(null);
                    notify("Applied. Use Undo in the toolbar to revert.");
                  }}
                >
                  Apply to canvas
                </Button>
                <Button size="sm" variant="outline" onClick={() => setResult(null)}>
                  Dismiss
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
