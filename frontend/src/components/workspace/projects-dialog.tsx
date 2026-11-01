import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { useWorkspace } from "@/lib/store";
import type { ProjectSummary, TemplateSummary } from "@/lib/types";

export function ProjectsDialog() {
  const open = useWorkspace((s) => s.dialog === "projects");
  const setDialog = useWorkspace((s) => s.setDialog);
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog(o ? "projects" : null)}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto">
        {open && <ProjectsBody />}
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while open, so the lists are fresh every time.
function ProjectsBody() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("My project");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.templates(), api.projects()])
      .then(([t, p]) => {
        if (!live) return;
        setTemplates(t);
        setProjects(p);
      })
      .catch((e: unknown) => live && setError(errorMessage(e, "Could not load projects")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const guard = () =>
    !useWorkspace.getState().dirty ||
    window.confirm("You have unsaved changes that will be lost. Continue?");

  const create = async (template: string) => {
    if (!guard()) return;
    setPending(`new:${template}`);
    setError(null);
    try {
      const project = await api.createProject(name.trim() || "Untitled", template);
      await useWorkspace.getState().openProject(project.id);
    } catch (e) {
      setError(errorMessage(e, "Could not create project"));
    } finally {
      setPending(null);
    }
  };

  const open = async (id: number) => {
    if (!guard()) return;
    setPending(`open:${id}`);
    await useWorkspace.getState().openProject(id);
    setPending(null);
  };

  return (
    <>
      <DialogHeader>
        <p className="eyebrow">Projects</p>
        <DialogTitle className="text-2xl">Start a project</DialogTitle>
        <DialogDescription>Pick a template, or open something you saved before.</DialogDescription>
      </DialogHeader>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Label className="grid gap-1.5 text-xs text-muted-foreground">
        Project name
        <Input value={name} className="text-foreground" onChange={(e) => setName(e.target.value)} />
      </Label>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <p className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading templates…
          </p>
        )}
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={pending !== null}
            onClick={() => void create(t.id)}
            className="flex min-h-28 flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors hover:border-primary disabled:opacity-60"
          >
            <strong className="text-sm">{t.name}</strong>
            <small className="text-xs text-muted-foreground">{t.description}</small>
          </button>
        ))}
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void create("")}
          className="flex min-h-28 flex-col items-start gap-1.5 rounded-lg border border-dashed p-3.5 text-left transition-colors hover:border-primary disabled:opacity-60"
        >
          <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
            <Plus className="size-4" />
          </span>
          <strong className="text-sm">Blank canvas</strong>
          <small className="text-xs text-muted-foreground">Start from nothing.</small>
        </button>
      </div>

      {projects.length > 0 && (
        <section className="border-t pt-4">
          <h3 className="mb-2 text-sm font-semibold">Open an existing project</h3>
          <ul className="divide-y rounded-lg border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{p.name}</strong>
                  <small className="text-xs text-muted-foreground">
                    v{p.latest_version ?? 0} · {new Date(p.updated_at).toLocaleDateString()}
                  </small>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending !== null}
                  onClick={() => void open(p.id)}
                >
                  {pending === `open:${p.id}` && <Loader2 className="animate-spin" />}
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
