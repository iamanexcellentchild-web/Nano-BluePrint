import { useMemo, useState } from "react";
import { ArrowRight, Bot, Plus, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { categoryColor, iconFor } from "@/lib/block-meta";
import { BLOCK_DRAG_MIME } from "@/lib/diagram";
import { useWorkspace } from "@/lib/store";
import { useAddBlock } from "@/hooks/use-add-block";
import { cn } from "@/lib/utils";

interface PaletteProps {
  className?: string;
  /** Called after the user picks something, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
}

const tint = (color: string) => `color-mix(in srgb, ${color} 14%, transparent)`;

export function Palette({ className, onNavigate }: PaletteProps) {
  const library = useWorkspace((s) => s.library);
  const setDialog = useWorkspace((s) => s.setDialog);
  const setTab = useWorkspace((s) => s.setTab);
  const addBlock = useAddBlock();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(library.categories)
      .map(([key, meta]) => ({
        key,
        meta,
        blocks: library.blocks.filter(
          (b) =>
            b.category === key &&
            (!q || `${b.label} ${b.description} ${b.type}`.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.blocks.length > 0);
  }, [library, query]);

  return (
    <aside className={cn("flex min-h-0 flex-col border-r bg-card", className)}>
      <div className="space-y-3 px-4 pt-5">
        <div>
          <p className="eyebrow">Block library</p>
          <h2 className="text-base font-semibold tracking-tight">Build your logic</h2>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks"
            aria-label="Search blocks"
            className="pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setDialog("projects");
            onNavigate?.();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg border border-primary/20 bg-accent p-2.5 text-left text-accent-foreground transition-colors hover:border-primary/40"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15">
            <Sparkles className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-xs">Start from a template</strong>
            <span className="block truncate text-[11px] opacity-80">Pick a ready-made flow</span>
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {!library && <p className="px-1 text-sm text-muted-foreground">Loading blocks…</p>}
        {library && groups.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No blocks match “{query}”.</p>
        )}
        {groups.map(({ key, meta, blocks }) => {
          const CategoryIcon = iconFor("", key);
          return (
            <section key={key}>
              <h3 className="mb-1 flex items-center gap-2 px-1 text-xs font-bold text-muted-foreground">
                <span
                  className="grid size-[18px] place-items-center rounded"
                  style={{ color: meta.color, background: tint(meta.color) }}
                >
                  <CategoryIcon className="size-3" />
                </span>
                {meta.label}
                <span className="ml-auto text-[10px] font-normal">{blocks.length}</span>
              </h3>
              {blocks.map((b) => {
                const Icon = iconFor(b.type, b.category);
                const color = categoryColor(library, b.category);
                return (
                  <button
                    key={b.type}
                    type="button"
                    draggable
                    title={b.description}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(BLOCK_DRAG_MIME, b.type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => {
                      addBlock(b.type);
                      onNavigate?.();
                    }}
                    className="group flex w-full cursor-grab items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-md"
                      style={{ color, background: tint(color) }}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs font-semibold">{b.label}</strong>
                      <small className="block truncate text-[11px] text-muted-foreground">
                        {b.description}
                      </small>
                    </span>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={() => {
            setTab("ai");
            onNavigate?.();
          }}
          className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
        >
          <Bot className="size-5 text-primary" />
          <span className="min-w-0 flex-1">
            <strong className="block text-xs">Need a hand?</strong>
            <small className="block text-[11px] text-muted-foreground">
              Ask Blueprint AI to review it
            </small>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
}
