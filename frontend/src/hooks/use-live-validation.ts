import { useEffect } from "react";
import { logicSignature } from "@/lib/diagram";
import { useWorkspace } from "@/lib/store";

/** Re-validates 500ms after the logic changes (not when blocks are merely dragged). */
export function useLiveValidation() {
  const ready = useWorkspace((s) => s.library !== null);
  const signature = useWorkspace((s) => logicSignature(s.nodes, s.edges));

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => void useWorkspace.getState().validate(), 500);
    return () => window.clearTimeout(timer);
  }, [ready, signature]);
}
