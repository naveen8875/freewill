import { useAppStore } from "../state/appStore";
import { setWorldSpeed } from "../state/worldCommands";
import { PixelThumb } from "./PixelThumb";

const SPEEDS = [0, 1, 3, 5];

export function TopBar() {
  const status = useAppStore((state) => state.status);
  const speed = useAppStore((state) => state.speed);
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const setPanel = useAppStore((state) => state.setPanel);
  const stepSimulation = useAppStore((state) => state.stepSimulation);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const civilizationStarted = useAppStore((state) => state.civilizationStarted);

  return (
    <header className="top-bar">
      <button className="brand-block" onClick={() => setPanel("worlds")} aria-label="Open world library">
        <span className="brand-mark"><PixelThumb asset="villager" scale={3} /></span>
        <span>
          <strong>freewill</strong>
          <small>{status ? `${status.name} · ${status.pop} villagers` : "A world shaped by choices"}</small>
        </span>
      </button>

      <div className="mode-switch" aria-label="Workspace mode">
        {(["observe", "build", "creator"] as const).map((value) => (
          <button
            key={value}
            disabled={historicalTick !== null && value !== "observe"}
            className={mode === value ? "is-active" : ""}
            onClick={() => {
              setMode(value);
              if (value === "creator") setPanel("creator");
              if (value === "build") setPanel("assets");
            }}
          >
            {value === "observe" ? "Live" : value === "build" ? "Build" : "Create"}
          </button>
        ))}
      </div>

      <div className="clock-block" aria-label="World time">
        <span className="clock-time">{status?.clock ?? "08:00"}</span>
        <span className="clock-meta">{status ? `${status.phase} · Day ${status.day}` : "Morning · Day 1"}</span>
      </div>

      <div className="speed-control" aria-label="Simulation speed">
        {SPEEDS.map((value) => (
          <button
            key={value}
            disabled={historicalTick !== null || !civilizationStarted}
            className={speed === value ? "is-active" : ""}
            onClick={() => setWorldSpeed(value)}
            aria-label={value === 0 ? "Pause simulation" : `Run at ${value} times speed`}
          >
            {value === 0 ? "Ⅱ" : `${value}×`}
          </button>
        ))}
        {speed === 0 && civilizationStarted ? <button disabled={historicalTick !== null} onClick={() => stepSimulation?.()} aria-label="Advance one simulation decision" title="Single step">→|</button> : null}
      </div>
    </header>
  );
}
