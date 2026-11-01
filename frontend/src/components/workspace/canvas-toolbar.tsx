import { useState } from "react";
import { Code2, LayoutGrid, Loader2, PanelLeft, Play, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { simulationEvents } from "@/lib/diagram";
import { selectErrorCount, useWorkspace } from "@/lib/store";
import { Palette } from "./palette";

export function CanvasToolbar() {
  const name = useWorkspace((s) => s.name);
  const busy = useWorkspace((s) => s.busy);
  const hasNodes = useWorkspace((s) => s.nodes.length > 0);
  const canUndo = useWorkspace((s) => s.history.length > 0);
  const running = useWorkspace((s) => s.sim.running);
  const hasEvents = useWorkspace((s) => simulationEvents(s.nodes).length > 0);
  const errors = useWorkspace(selectErrorCount);
  const { setDialog, autoLayout, undo, generate, runSimulation } = useWorkspace.getState();
  const [blocksOpen, setBlocksOpen] = useState(false);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-3">
      <div className="flex min-w-0 items-center gap-2">
        {/* below lg the permanent library is hidden, so it opens as a drawer */}
        <Sheet open={blocksOpen} onOpenChange={setBlocksOpen}>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setBlocksOpen(true)}
          >
            <PanelLeft /> Blocks
          </Button>
          <SheetContent side="left" className="w-80 p-0">
            <SheetTitle className="sr-only">Block library</SheetTitle>
            <Palette className="h-full border-r-0" onNavigate={() => setBlocksOpen(false)} />
          </SheetContent>
        </Sheet>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setDialog("projects")}
          >
            Projects
          </button>
          <span className="text-muted-foreground">/</span>
          <strong className="truncate">{name || "Untitled"}</strong>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!hasNodes} onClick={autoLayout} title="Tidy the layout (undoable)">
          <LayoutGrid /> <span className="hidden md:inline">Arrange</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo}
          onClick={undo}
          title="Undo the last AI change or Arrange"
        >
          <Undo2 /> <span className="hidden md:inline">Undo</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null || errors > 0 || !hasNodes}
          title={errors ? "Fix errors first" : "Download a generated backend project"}
          onClick={() => void generate(false)}
        >
          {busy === "code" ? <Loader2 className="animate-spin" /> : <Code2 />}
          <span className="hidden md:inline">Generate code</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasEvents || running}
          title={hasEvents ? "Run the selected event" : "Add an Event block to simulate"}
          onClick={() => void runSimulation()}
        >
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? "Running…" : "Simulate"}
        </Button>
      </div>
    </div>
  );
}
