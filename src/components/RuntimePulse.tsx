import { useState } from "react";
import { useAppStore } from "../state/appStore";

function milliseconds(value: number) {
  if (value < 1) return "<1 ms";
  return `${Math.round(value)} ms`;
}

export function RuntimePulse() {
  const [open, setOpen] = useState(false);
  const performance = useAppStore((state) => state.runtimePerformance);

  if (!performance) return null;

  const utilization = performance.totalMs / performance.budgetMs;
  const temperature = utilization > 1 ? "hot" : utilization > 0.75 ? "warm" : "cool";
  const stateLabel = temperature === "hot" ? "over budget" : temperature === "warm" ? "busy" : "steady";

  return (
    <aside className={`runtime-pulse is-${temperature}${open ? " is-open" : ""}`} aria-label="Simulation performance">
      {open ? (
        <div className="runtime-pulse-details">
          <header>
            <span>
              <strong>Tick {performance.tick}</strong>
              <small>{performance.ticksPerCycle} logical tick{performance.ticksPerCycle === 1 ? "" : "s"} this cycle · {performance.speed}×</small>
            </span>
            <span className="runtime-pulse-temperature">{stateLabel}</span>
          </header>
          <dl>
            <div><dt>Simulation</dt><dd>{milliseconds(performance.engineMs)}</dd></div>
            <div><dt>World copy</dt><dd>{milliseconds(performance.snapshotMs)}</dd></div>
            <div><dt>Renderer</dt><dd>{milliseconds(performance.rendererMs)}</dd></div>
            <div><dt>Interface</dt><dd>{milliseconds(performance.publishMs)}</dd></div>
            <div><dt>Cycle budget</dt><dd>{milliseconds(performance.budgetMs)}</dd></div>
            {performance.brainLatencyMs !== undefined ? <div><dt>Last brain call</dt><dd>{milliseconds(performance.brainLatencyMs)}</dd></div> : null}
            <div><dt>Brains waiting</dt><dd>{performance.pendingBrains}</dd></div>
          </dl>
          <p>Live playback advances one world tick per beat so every planned route can animate smoothly.</p>
        </div>
      ) : null}
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i aria-hidden="true" />
        <span>Engine pulse</span>
        <strong>{milliseconds(performance.totalMs)}</strong>
      </button>
    </aside>
  );
}
