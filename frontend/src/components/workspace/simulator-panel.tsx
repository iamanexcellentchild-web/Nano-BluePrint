import { useMemo } from "react";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { resolveEvent, simulationEvents } from "@/lib/diagram";
import { useWorkspace } from "@/lib/store";
import { useAddBlock } from "@/hooks/use-add-block";

export function SimulatorPanel() {
  const nodes = useWorkspace((s) => s.nodes);
  const sim = useWorkspace((s) => s.sim);
  const hasEventBlock = useWorkspace((s) => s.library?.blocks.some((b) => b.type === "event"));
  const { setSimEvent, setSimPayload, fillSimPayload, runSimulation, clearSimulation } =
    useWorkspace.getState();
  const addBlock = useAddBlock();

  const events = useMemo(() => simulationEvents(nodes), [nodes]);
  const current = resolveEvent(events, sim.event);

  if (!current) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Add an Event block (and give it a name) to simulate it.</p>
        {hasEventBlock && (
          <Button variant="outline" size="sm" onClick={() => addBlock("event")}>
            Add an Event block
          </Button>
        )}
      </div>
    );
  }

  const { result } = sim;
  return (
    <div className="space-y-3">
      <Label className="grid gap-1.5 text-xs text-muted-foreground">
        Event
        <NativeSelect
          value={current.name}
          className="text-foreground"
          onChange={(e) => setSimEvent(e.target.value)}
        >
          {events.map((e) => (
            <option key={e.name}>{e.name}</option>
          ))}
        </NativeSelect>
      </Label>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Label htmlFor="sim-payload">Sample record / data</Label>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={fillSimPayload}>
            fill from table
          </Button>
        </div>
        <Textarea
          id="sim-payload"
          rows={6}
          spellCheck={false}
          className="font-mono text-xs"
          value={sim.payload}
          onChange={(e) => setSimPayload(e.target.value)}
        />
      </div>

      <Button disabled={sim.running} onClick={() => void runSimulation()}>
        {sim.running ? <Loader2 className="animate-spin" /> : <Play />}
        {sim.running ? "Running…" : "Run simulation"}
      </Button>

      {result && (
        <div className="space-y-3 border-t pt-3">
          <p
            className={`flex items-start gap-2 text-sm font-medium ${result.ok ? "text-success" : "text-destructive"}`}
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            {result.ok ? "Ran to completion" : (result.error ?? "Simulation failed")}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            {result.trace.map((t, i) => (
              <li key={i}>{t.summary}</li>
            ))}
          </ol>
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Result</h4>
            <pre className="max-h-56 overflow-auto rounded-md bg-muted p-2 text-xs">
              {JSON.stringify(result.context, null, 2)}
            </pre>
          </div>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearSimulation}>
            Clear highlight
          </Button>
        </div>
      )}
    </div>
  );
}
