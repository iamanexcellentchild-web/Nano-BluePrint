import { useCallback } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useWorkspace } from "@/lib/store";

/** Adds a block at the centre of what the user is currently looking at (must be inside ReactFlowProvider). */
export function useAddBlock() {
  const { getViewport } = useReactFlow();
  const flow = useStoreApi();
  return useCallback(
    (type: string) => {
      const { width, height } = flow.getState();
      const { x, y, zoom } = getViewport();
      const stagger = (useWorkspace.getState().nodes.length % 6) * 24;
      useWorkspace.getState().addBlock(type, {
        x: (width / 2 - x) / zoom - 90 + stagger,
        y: (height / 2 - y) / zoom - 30 + stagger,
      });
    },
    [flow, getViewport],
  );
}
