import { useEffect } from "react";
import { useAppStore } from "../state/appStore";
import { saveCurrentWorld } from "./worldLibrary";

export function useAutoSave() {
  const renderer = useAppStore((state) => state.renderer);

  useEffect(() => {
    if (!renderer) return;
    const interval = window.setInterval(() => {
      if (useAppStore.getState().historicalTick !== null) return;
      void saveCurrentWorld()
        .then(() => useAppStore.getState().setPersistenceError(null))
        .catch((cause) => useAppStore.getState().setPersistenceError(cause instanceof Error ? cause.message : "Autosave failed."));
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [renderer]);
}
