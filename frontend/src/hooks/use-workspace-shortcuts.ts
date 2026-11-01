import { useEffect } from "react";
import { useWorkspace } from "@/lib/store";

/** Ctrl/Cmd+S saves a version; leaving with unsaved changes asks first. */
export function useWorkspaceShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useWorkspace.getState().save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useWorkspace.getState().dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}
