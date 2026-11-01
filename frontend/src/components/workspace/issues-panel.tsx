import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import type { Issue } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: Record<Issue["level"], number> = { error: 0, warning: 1, info: 2 };
const STYLE: Record<Issue["level"], { icon: LucideIcon; text: string; bar: string }> = {
  error: { icon: AlertCircle, text: "text-destructive", bar: "border-l-destructive" },
  warning: { icon: TriangleAlert, text: "text-warning", bar: "border-l-warning" },
  info: { icon: Info, text: "text-muted-foreground", bar: "border-l-muted-foreground" },
};

export function IssuesPanel() {
  const issues = useWorkspace((s) => s.issues);
  const nodes = useWorkspace((s) => s.nodes);
  const focusNode = useWorkspace((s) => s.focusNode);

  if (!issues.length) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        No problems found. The logic is complete enough to generate.
      </p>
    );
  }

  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <ul className="space-y-1.5">
      {sorted.map((issue, k) => {
        const { icon: Icon, text, bar } = STYLE[issue.level];
        const target = issue.node_id !== null && nodes.some((n) => n.id === issue.node_id);
        return (
          <li key={k}>
            <button
              type="button"
              disabled={!target}
              title={target ? "Show this block" : undefined}
              onClick={() => issue.node_id && focusNode(issue.node_id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border border-l-4 bg-muted/40 p-2.5 text-left text-xs transition-colors enabled:cursor-pointer enabled:hover:bg-accent",
                bar,
              )}
            >
              <Icon className={cn("mt-0.5 size-3.5 shrink-0", text)} />
              <span>
                <strong className={cn("mr-1 capitalize", text)}>{issue.level}</strong>
                {issue.message}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
