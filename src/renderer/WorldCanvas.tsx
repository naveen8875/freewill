import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { LegacyCanvasRenderer } from "./WorldRenderer";
import { initializeBuilderHistory, recordBuilderMutation } from "../state/builderHistory";

const FIRST_PEOPLE = ["Rowan", "Mika", "Sol", "Ines", "Teo", "Lía", "Noor", "Wren", "Paz", "Juno", "Rafa", "Vera"];

export function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setRenderer = useAppStore((state) => state.setRenderer);
  const setStatus = useAppStore((state) => state.setStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: LegacyCanvasRenderer | null = null;
    try {
      renderer = new LegacyCanvasRenderer(canvas, () => {
        setStatus(renderer?.getStatus() ?? null);
      }, () => recordBuilderMutation());
      renderer.loadGeneratedWorld("First Light", 7, 128, 128, { hour: 8, season: 1, harshness: "balanced" });
      renderer.configureWorld({
        name: "First Light",
        population: FIRST_PEOPLE.length,
        abundance: "balanced",
        roster: FIRST_PEOPLE.map((name, appearance) => ({
          name,
          job: "unassigned",
          trait: "",
          goal: "Survive, learn this place, and choose a life",
          inventory: {},
          appearance: appearance % 4,
          initialNeeds: { hunger: 0.28, fatigue: 0.18, loneliness: 0.25, thirst: 0.28 },
        })),
      });
      renderer.setSpeed(0);
      setRenderer(renderer);
      setStatus(renderer.getStatus());
      queueMicrotask(() => initializeBuilderHistory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The world renderer could not start.");
      return;
    }

    const interval = window.setInterval(() => {
      setStatus(renderer?.getStatus() ?? null);
    }, 500);

    return () => {
      window.clearInterval(interval);
      renderer?.destroy();
      setRenderer(null);
      setStatus(null);
    };
  }, [setRenderer, setStatus]);

  return (
    <div className="world-canvas-frame">
      <canvas ref={canvasRef} className="world-canvas" aria-label="Interactive freewill wilderness" tabIndex={0} />
      {error ? (
        <div className="world-error" role="alert">
          <strong>This world could not wake.</strong>
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
