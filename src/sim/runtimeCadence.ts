export interface SimulationCadence {
  intervalMs: number;
  ticksPerCycle: number;
  visualSpeed: number;
}

/** Keeps logical fast-forward and visible animation on the same steady beat. */
export function simulationCadence(speed: number): SimulationCadence {
  if (!Number.isFinite(speed) || speed <= 0) return { intervalMs: 1_700, ticksPerCycle: 0, visualSpeed: 0 };
  // Live playback intentionally tops out at 5×. A single authoritative tick
  // per visual beat gives the renderer an actual route to animate; batching
  // several movement ticks made villagers jump between distant positions.
  // Headless evolution remains uncapped because it has no visual contract.
  const liveSpeed = Math.min(5, speed);
  const targetTicksPerSecond = liveSpeed / 1.7;
  const intervalMs = Math.round(1_000 / targetTicksPerSecond);
  return {
    intervalMs,
    ticksPerCycle: 1,
    visualSpeed: Math.min(3, liveSpeed),
  };
}
