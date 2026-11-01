import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { DemoUser } from "@/lib/demo-auth";
import { useWorkspace } from "@/lib/store";
import { useLiveValidation } from "@/hooks/use-live-validation";
import { useWorkspaceShortcuts } from "@/hooks/use-workspace-shortcuts";
import { CanvasToolbar } from "./workspace/canvas-toolbar";
import { FlowCanvas } from "./workspace/flow-canvas";
import { HelpDialog } from "./workspace/help-dialog";
import { Palette } from "./workspace/palette";
import { ProjectsDialog } from "./workspace/projects-dialog";
import { SettingsDialog } from "./workspace/settings-dialog";
import { SidePanel } from "./workspace/side-panel";
import { StatusBar } from "./workspace/status-bar";
import { Topbar } from "./workspace/topbar";

export function BlueprintWorkspace(props: { user: DemoUser; onSignOut: () => void }) {
  return (
    <ReactFlowProvider>
      <Workspace {...props} />
    </ReactFlowProvider>
  );
}

function Workspace({ user, onSignOut }: { user: DemoUser; onSignOut: () => void }) {
  useEffect(() => {
    void useWorkspace.getState().boot();
  }, []);
  useLiveValidation();
  useWorkspaceShortcuts();

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Topbar user={user} onSignOut={onSignOut} />
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-cols-[240px_minmax(0,1fr)_340px] lg:grid-rows-1">
        <Palette className="hidden lg:flex" />
        <section aria-label="Diagram canvas" className="flex min-h-0 min-w-0 flex-col">
          <CanvasToolbar />
          <div className="relative min-h-0 flex-1">
            <FlowCanvas />
          </div>
          <StatusBar />
        </section>
        <SidePanel />
      </div>
      <ProjectsDialog />
      <HelpDialog />
      <SettingsDialog />
    </main>
  );
}
