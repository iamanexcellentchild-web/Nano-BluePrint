import {
  Check,
  CircleHelp,
  FolderOpen,
  Loader2,
  LogOut,
  Moon,
  Save,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { initials, type DemoUser } from "@/lib/demo-auth";
import { selectErrorCount, useWorkspace } from "@/lib/store";
import { TARGETS } from "@/lib/targets";
import { useTheme } from "@/hooks/use-theme";

function SaveStatus() {
  const dirty = useWorkspace((s) => s.dirty);
  const projectId = useWorkspace((s) => s.projectId);
  const savedAt = useWorkspace((s) => s.savedAt);
  const version = useWorkspace((s) => s.version);

  if (dirty) {
    return (
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
        <span className="size-2 rounded-full bg-warning" /> Unsaved changes
      </span>
    );
  }
  const label =
    projectId === null
      ? "Not saved yet"
      : savedAt
        ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : version !== null
          ? `Saved · v${version}`
          : "Saved";
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
      {projectId !== null && <Check className="size-3.5 text-success" />} {label}
    </span>
  );
}

export function Topbar({ user, onSignOut }: { user: DemoUser; onSignOut: () => void }) {
  const name = useWorkspace((s) => s.name);
  const target = useWorkspace((s) => s.target);
  const busy = useWorkspace((s) => s.busy);
  const dirty = useWorkspace((s) => s.dirty);
  const projectId = useWorkspace((s) => s.projectId);
  const errors = useWorkspace(selectErrorCount);
  const { setName, setTarget, setDialog, save, generate } = useWorkspace.getState();
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-3 sm:px-4">
      <div className="hidden sm:block">
        <Brand />
      </div>
      <Input
        aria-label="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-40 border-transparent bg-transparent font-semibold shadow-none hover:border-input sm:ml-2 sm:w-52"
      />
      <SaveStatus />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => setDialog("help")}>
          <CircleHelp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={() => setDialog("settings")}
        >
          <Settings2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDialog("projects")}>
          <FolderOpen /> <span className="hidden md:inline">Projects</span>
        </Button>
        <NativeSelect
          aria-label="Generated backend"
          containerClassName="hidden w-44 lg:block"
          className="h-8 text-xs"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          title="Save a new version (Ctrl/⌘+S)"
          disabled={busy !== null || (!dirty && projectId !== null)}
          onClick={() => void save()}
        >
          {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
          <span className="hidden sm:inline">Save version</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || errors > 0}
          title={
            errors
              ? "Fix errors first"
              : "Send the diagram to the configured AI provider for custom-block implementations and a generation review"
          }
          onClick={() => void generate(true)}
        >
          {busy === "ai-code" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          <span className="hidden md:inline">AI generate</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              {initials(user.name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut className="mr-2 size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
