import { useState } from "react";
import { AlertCircle, MousePointerClick, Plus, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { categoryColor, iconFor } from "@/lib/block-meta";
import { notify } from "@/lib/notify";
import { useWorkspace } from "@/lib/store";
import type { ConfigField, Library } from "@/lib/types";

type FieldRow = {
  name: string;
  type: string;
  required: boolean;
  target?: string | undefined;
  on_delete?: string | undefined;
};

const isRelation = (type: string) => type === "foreign_key" || type === "many_to_many";

const retype = (row: FieldRow, type: string): FieldRow => {
  const { target: _target, on_delete: _onDelete, ...rest } = row;
  return {
    ...rest,
    type,
    required: isRelation(type) ? false : row.required,
    ...(type === "foreign_key" ? { on_delete: "cascade" } : {}),
  };
};

const parseTags = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** Keeps what's typed (including a trailing comma) locally; commits the parsed list upward. */
function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <Input
      value={text}
      placeholder="comma, separated"
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseTags(e.target.value));
      }}
    />
  );
}

function FieldsEditor({
  rows,
  onChange,
  library,
  tables,
}: {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
  library: Library;
  tables: string[];
}) {
  const patch = (i: number, p: Partial<FieldRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-md border bg-muted/40 p-2">
          <div className="flex gap-1.5">
            <Input
              value={r.name}
              placeholder="field name"
              aria-label="Field name"
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Remove field"
              title="Remove field"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              containerClassName="flex-1"
              aria-label="Field type"
              value={r.type}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? retype(x, e.target.value) : x)))}
            >
              {[...library.field_types, ...library.relation_types].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </NativeSelect>
            {r.type !== "many_to_many" && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!r.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                required
              </label>
            )}
          </div>
          {library.relation_types.includes(r.type) && (
            <NativeSelect
              aria-label={`Related table for ${r.name || "field"}`}
              value={r.target ?? ""}
              onChange={(e) => patch(i, { target: e.target.value })}
            >
              <option value="">Select related table</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          )}
          {r.type === "foreign_key" && (
            <NativeSelect
              aria-label={`Delete behavior for ${r.name || "field"}`}
              value={r.on_delete ?? "cascade"}
              onChange={(e) =>
                patch(i, {
                  on_delete: e.target.value,
                  ...(e.target.value === "set_null" ? { required: false } : {}),
                })
              }
            >
              {library.delete_behaviors.map((d) => (
                <option key={d} value={d}>
                  on delete: {d}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { name: "", type: "string", required: false }])}
      >
        <Plus /> Add field
      </Button>
    </div>
  );
}

export function Inspector() {
  const library = useWorkspace((s) => s.library);
  const node = useWorkspace((s) => s.nodes.find((n) => n.id === s.selectedId));
  const tables = useWorkspace(
    useShallow((s) =>
      s.nodes
        .filter((n) => n.data.blockType === "entity" && n.id !== s.selectedId)
        .map((n) => String(n.data.config["name"] ?? "") || n.data.label),
    ),
  );
  const issues = useWorkspace(
    useShallow((s) => s.issues.filter((i) => i.node_id !== null && i.node_id === s.selectedId)),
  );
  const updateNode = useWorkspace((s) => s.updateNode);
  const removeNode = useWorkspace((s) => s.removeNode);

  const def = node && library?.blocks.find((b) => b.type === node.data.blockType);
  if (!node || !def || !library) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-6" />
        <p>Select a block to edit it.</p>
        <p className="text-xs">Connect blocks by dragging from the dot on one block’s right edge.</p>
      </div>
    );
  }

  const config = node.data.config;
  const set = (key: string, value: unknown) =>
    updateNode(node.id, { config: { ...config, [key]: value } });
  const color = categoryColor(library, def.category);
  const Icon = iconFor(def.type, def.category);

  const renderField = (f: ConfigField) => {
    const v = config[f.key];
    switch (f.kind) {
      case "textarea":
        return <Textarea rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value)} />;
      case "number":
        return (
          <Input
            type="number"
            value={typeof v === "number" || typeof v === "string" ? v : ""}
            onChange={(e) => {
              const raw = e.target.value;
              set(f.key, raw === "" || Number.isNaN(Number(raw)) ? raw : Number(raw));
            }}
          />
        );
      case "select": {
        const options = f.options ?? [];
        const value = typeof v === "string" ? v : "";
        return (
          <NativeSelect value={value} onChange={(e) => set(f.key, e.target.value)}>
            {!options.includes(value) && <option value="">Select…</option>}
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </NativeSelect>
        );
      }
      case "tags":
        return (
          <TagsInput
            value={Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []}
            onChange={(tags) => set(f.key, tags)}
          />
        );
      case "fields":
        return (
          <FieldsEditor
            rows={Array.isArray(v) ? (v as FieldRow[]) : []}
            onChange={(rows) => set(f.key, rows)}
            library={library}
            tables={tables}
          />
        );
      default:
        return <Input value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    // keyed so per-block local state (e.g. the tag text) resets when the selection changes
    <div key={node.id} className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-md"
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{def.label}</h3>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
      </div>

      <Label className="grid gap-1.5 text-xs text-muted-foreground">
        Label on canvas
        <Input
          value={node.data.label}
          className="text-foreground"
          onChange={(e) => updateNode(node.id, { label: e.target.value })}
        />
      </Label>

      {def.config_fields.map((f) => (
        <Label key={f.key} className="grid gap-1.5 text-xs text-muted-foreground">
          <span>
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </span>
          <div className="text-foreground">{renderField(f)}</div>
        </Label>
      ))}

      {issues.length > 0 && (
        <ul className="space-y-1.5">
          {issues.map((i, k) => (
            <li
              key={k}
              className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-foreground"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          removeNode(node.id);
          notify(`Deleted “${node.data.label || def.label}”`);
        }}
      >
        <Trash2 /> Delete block
      </Button>
    </div>
  );
}
