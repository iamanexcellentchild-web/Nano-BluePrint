import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { categoryColor, iconFor } from "@/lib/block-meta";
import { useWorkspace } from "@/lib/store";
import type { BlockDef, BlockNodeT } from "@/lib/types";
import { cn } from "@/lib/utils";

const BRANCH_LABELS: Record<string, string> = { true: "yes", false: "no" };
const BADGE_COLORS = { error: "bg-destructive", warning: "bg-warning", info: "bg-muted-foreground" };

/** A short line under the block title: the most useful bit of its configuration. */
function summary(def: BlockDef, config: Record<string, unknown>): string {
  if (def.type === "entity") {
    const fields = config["fields"];
    return `${Array.isArray(fields) ? fields.length : 0} fields`;
  }
  if (def.type === "actor") {
    const permissions = config["permissions"];
    return Array.isArray(permissions) ? permissions.join(", ") : "";
  }
  return def.config_fields
    .filter((f) => f.kind === "text" || f.kind === "textarea" || f.kind === "select")
    .map((f) => config[f.key])
    .filter((v): v is string => typeof v === "string" && v !== "")
    .slice(0, 3)
    .join(" · ");
}

export function BlockNode({ id, data, selected }: NodeProps<BlockNodeT>) {
  const library = useWorkspace((s) => s.library);
  const issues = useWorkspace(useShallow((s) => s.issues.filter((i) => i.node_id === id)));
  const step = useWorkspace((s) => s.trace[id]);
  const def = library?.blocks.find((b) => b.type === data.blockType);

  if (!def) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Unknown block: {data.blockType}
      </div>
    );
  }

  const color = categoryColor(library, def.category);
  const Icon = iconFor(def.type, def.category);
  const worst = issues.some((i) => i.level === "error")
    ? "error"
    : issues.some((i) => i.level === "warning")
      ? "warning"
      : issues.length
        ? "info"
        : null;

  return (
    <div
      className={cn(
        "relative min-w-44 max-w-60 rounded-lg border border-l-[5px] bg-card px-3 py-2 text-card-foreground shadow-sm transition-shadow",
        selected && "outline-2 outline-offset-2 outline-primary",
      )}
      style={{
        borderLeftColor: color,
        ...(step ? { boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)` } : {}),
      }}
    >
      {def.inputs && <Handle type="target" position={Position.Left} />}

      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
        <Icon className="size-3" aria-hidden="true" />
        {def.label}
      </div>
      <div className="truncate text-sm font-semibold">{data.label || def.label}</div>
      <div className="min-h-4 truncate text-xs text-muted-foreground">
        {summary(def, data.config)}
      </div>

      {worst && (
        <span
          className={cn(
            "absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold text-white",
            BADGE_COLORS[worst],
          )}
          title={issues.map((i) => i.message).join("\n")}
        >
          {issues.length}
        </span>
      )}
      {step ? (
        <span
          className="absolute -left-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background"
          title="Order this block ran in the simulation"
        >
          {step}
        </span>
      ) : null}

      {def.outputs.length > 1 ? (
        def.outputs.map((output, i) => (
          <Handle
            key={output}
            id={output}
            type="source"
            position={Position.Right}
            style={{ top: `${35 + i * 35}%` }}
          >
            <span className="pointer-events-none absolute -top-1.5 right-3.5 text-[10px] text-muted-foreground">
              {BRANCH_LABELS[output] ?? output}
            </span>
          </Handle>
        ))
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
