import { selectErrorCount, selectWarningCount, useWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const blocks = useWorkspace((s) => s.nodes.length);
  const links = useWorkspace((s) => s.edges.length);
  const version = useWorkspace((s) => s.version);
  const errors = useWorkspace(selectErrorCount);
  const warnings = useWorkspace(selectWarningCount);
  const setTab = useWorkspace((s) => s.setTab);

  const summary = errors
    ? `${errors} error${errors > 1 ? "s" : ""}`
    : warnings
      ? `${warnings} warning${warnings > 1 ? "s" : ""}`
      : "No problems";

  return (
    <div className="flex h-8 shrink-0 items-center gap-5 border-t bg-card px-4 text-[11px] text-muted-foreground">
      <button
        type="button"
        title="Open the Checks tab"
        onClick={() => setTab("checks")}
        className="flex items-center gap-1.5 hover:text-foreground"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            errors ? "bg-destructive" : warnings ? "bg-warning" : "bg-success",
          )}
        />
        {summary}
        {errors > 0 && warnings > 0 && ` · ${warnings} warning${warnings > 1 ? "s" : ""}`}
      </button>
      <span>
        {blocks} blocks · {links} links
      </span>
      {version !== null && <span className="ml-auto">v{version}</span>}
    </div>
  );
}
