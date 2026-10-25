import { useAppStore } from "../state/appStore";
import { startCivilization } from "../state/worldCommands";
import { PixelThumb } from "./PixelThumb";

export function CivilizationStartGate() {
  const started = useAppStore((state) => state.civilizationStarted);
  const status = useAppStore((state) => state.status);
  const mode = useAppStore((state) => state.mode);
  const decisionMode = useAppStore((state) => state.decisionMode);
  const brainDeployment = useAppStore((state) => state.brainDeployment);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const replayStartRequested = useAppStore((state) => state.replayStartRequested);
  const panelOpen = useAppStore((state) => state.panelOpen);

  if (started || historicalTick !== null || replayStartRequested || panelOpen || !status || mode === "creator") return null;

  const mind = decisionMode === "local-brain" ? brainDeployment?.label ?? "Local evolving brains" : "Local lab";
  return (
    <section className="civilization-start-gate" aria-label="World ready to start">
      <span className="start-gate-art" aria-hidden="true"><PixelThumb asset="campfire" scale={3} /></span>
      <span className="start-gate-copy">
        <small>World at rest</small>
        <strong>{status.name} is ready</strong>
        <p>No time or villager decisions will advance until you begin.</p>
        <span>{status.pop} villagers · {mind}</span>
      </span>
      <button type="button" onClick={startCivilization}>Start world</button>
    </section>
  );
}
