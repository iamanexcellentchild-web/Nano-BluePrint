import { useCallback, useEffect, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { FolderOpen, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryColor } from "@/lib/block-meta";
import { BLOCK_DRAG_MIME, canConnect } from "@/lib/diagram";
import { useWorkspace } from "@/lib/store";
import type { BlockNodeT } from "@/lib/types";
import { useTheme } from "@/hooks/use-theme";
import { BlockNode } from "./block-node";

// Must be stable (module scope) or React Flow re-mounts every node on each render.
const nodeTypes = { block: BlockNode };
const defaultEdgeOptions = { type: "smoothstep" };
const proOptions = { hideAttribution: true };

export function FlowCanvas() {
  const nodes = useWorkspace((s) => s.nodes);
  const edges = useWorkspace((s) => s.edges);
  const library = useWorkspace((s) => s.library);
  const fit = useWorkspace((s) => s.fit);
  const onNodesChange = useWorkspace((s) => s.onNodesChange);
  const onEdgesChange = useWorkspace((s) => s.onEdgesChange);
  const onConnect = useWorkspace((s) => s.onConnect);
  const theme = useTheme((s) => s.theme);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Re-frame when a diagram loads, is rearranged, or an issue points at a block.
  useEffect(() => {
    if (fit.rev === 0) return undefined;
    const timer = window.setTimeout(() => {
      void fitView(
        fit.nodeId
          ? { nodes: [{ id: fit.nodeId }], padding: 0.6, maxZoom: 1.1, duration: 300 }
          : { padding: 0.2, maxZoom: 1.1, duration: 300 },
      );
    }, 60); // let React Flow measure new nodes first
    return () => window.clearTimeout(timer);
  }, [fit, fitView]);

  // Reads fresh state so the callback stays stable while the diagram changes.
  const isValidConnection = useCallback((c: Edge | Connection) => {
    const s = useWorkspace.getState();
    return canConnect(s.library, s.nodes, s.edges, c);
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(BLOCK_DRAG_MIME);
    if (!type) return;
    const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    useWorkspace.getState().addBlock(type, { x: at.x - 90, y: at.y - 30 });
  };

  const categoryOf = (n: BlockNodeT) =>
    library?.blocks.find((b) => b.type === n.data.blockType)?.category ?? "";

  return (
    <div
      className="absolute inset-0"
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
    >
      <ReactFlow<BlockNodeT>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => {
          const s = useWorkspace.getState();
          s.select(node.id);
          s.setTab("block");
        }}
        onPaneClick={() => useWorkspace.getState().select(null)}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={proOptions}
        colorMode={theme}
        minZoom={0.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => categoryColor(library, categoryOf(n as BlockNodeT))}
        />
      </ReactFlow>
      <CanvasOverlay />
    </div>
  );
}

/** Explains why the canvas is empty: still connecting, API unreachable, or just a blank diagram. */
function CanvasOverlay() {
  const status = useWorkspace((s) => s.status);
  const bootError = useWorkspace((s) => s.bootError);
  const empty = useWorkspace((s) => s.nodes.length === 0);
  const projectsOpen = useWorkspace((s) => s.dialog === "projects");
  const boot = useWorkspace((s) => s.boot);
  const setDialog = useWorkspace((s) => s.setDialog);

  if (status === "booting") {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <p className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="size-4 animate-spin" /> Connecting to Blueprint…
        </p>
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="max-w-sm rounded-xl border bg-card p-6 text-center shadow-lg">
          <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
            <WifiOff className="size-5" />
          </span>
          <h2 className="font-semibold">Can’t load the block library</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{bootError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" onClick={() => void boot()}>
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("settings")}>
              Open settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (empty && !projectsOpen) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Drag a block from the library, or start from a template.
        </p>
        <Button size="sm" className="pointer-events-auto" onClick={() => setDialog("projects")}>
          <FolderOpen /> Browse templates
        </Button>
      </div>
    );
  }
  return null;
}
