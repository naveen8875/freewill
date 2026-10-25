import { WorldCanvas } from "../renderer/WorldCanvas";
import { TopBar } from "../components/TopBar";
import { SideNav } from "../components/SideNav";
import { PanelDock } from "../components/PanelDock";
import { BottomDock } from "../components/BottomDock";
import { CreatorStudio } from "../features/creator/CreatorStudio";
import { useAppStore } from "../state/appStore";
import { useSimulationRuntime } from "../sim/useSimulationRuntime";
import { useAutoSave } from "../persistence/useAutoSave";
import { SocietyHUD } from "../components/SocietyHUD";
import { CivilizationStartGate } from "../components/CivilizationStartGate";
import { RuntimePulse } from "../components/RuntimePulse";
import { EvolutionObservatory } from "../features/observatory/EvolutionObservatory";

function WorldApp() {
  useSimulationRuntime();
  useAutoSave();
  const mode = useAppStore((state) => state.mode);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const replayError = useAppStore((state) => state.replayError);

  return (
    <main className={`app-shell mode-${mode}`}>
      <WorldCanvas />
      <div className="world-vignette" aria-hidden="true" />
      <TopBar />
      <SocietyHUD />
      <CivilizationStartGate />
      {mode !== "creator" ? <SideNav /> : null}
      <PanelDock />
      <BottomDock />
      <RuntimePulse />
      {mode === "creator" ? <CreatorStudio /> : null}
      {historicalTick !== null ? <div className="historical-banner" role="status"><strong>Historical view · tick {historicalTick}</strong><span>Read-only replay</span><button onClick={() => useAppStore.getState().viewSimulationTick?.(null)}>Return to present</button></div> : null}
      {replayError ? <div className="replay-error" role="alert"><strong>Replay stopped</strong><span>{replayError}</span><button onClick={() => useAppStore.getState().setReplayError(null)}>Dismiss</button></div> : null}
      <div className="canvas-help" aria-hidden="true">Drag to roam · scroll to zoom · WASD to wander</div>
    </main>
  );
}

export function App() {
  if (window.location.pathname.startsWith("/observatory")) return <EvolutionObservatory />;
  return <WorldApp />;
}
