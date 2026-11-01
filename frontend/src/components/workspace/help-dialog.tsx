import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/store";

const STEPS: [string, string][] = [
  ["Add a block", "Drag one from the library onto the canvas, or click it to drop it in the middle of the view."],
  ["Connect blocks", "Drag from the dot on a block’s right edge to another block. Only valid pairings connect. Conditions have separate yes and no outputs."],
  ["Edit details", "Click a block to change its settings in the Block tab. Backspace or Delete removes the selected block or link."],
  ["Move around", "Drag empty space to pan and scroll to zoom. Arrange tidies the layout, and Undo reverts it."],
  ["Check your logic", "The Checks tab validates as you work. Click a problem to jump to the block. Errors must be fixed before generating."],
  ["Simulate", "Pick an Event and sample data, then run. The blocks that ran are numbered on the canvas."],
  ["Save and generate", "Ctrl/⌘+S saves a version. Generate code downloads a backend project; AI generate also fills in custom blocks."],
];

export function HelpDialog() {
  const open = useWorkspace((s) => s.dialog === "help");
  const setDialog = useWorkspace((s) => s.setDialog);
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog(o ? "help" : null)}>
      <DialogContent className="max-h-[88dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <p className="eyebrow">Blueprint help</p>
          <DialogTitle className="text-2xl">Build your first flow</DialogTitle>
          <DialogDescription>Seven things worth knowing.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2.5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex items-start gap-3 rounded-lg border p-3">
              <b className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs text-accent-foreground">
                {i + 1}
              </b>
              <span className="text-sm">
                <strong className="block">{title}</strong>
                <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <Button onClick={() => setDialog(null)}>Got it</Button>
      </DialogContent>
    </Dialog>
  );
}
