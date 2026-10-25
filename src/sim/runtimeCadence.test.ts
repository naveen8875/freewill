import { describe, expect, it } from "vitest";
import { simulationCadence } from "./runtimeCadence";

describe("simulationCadence", () => {
  it("preserves normal pacing and caps live playback at a smooth single-tick 5x cadence", () => {
    expect(simulationCadence(0)).toEqual({ intervalMs: 1_700, ticksPerCycle: 0, visualSpeed: 0 });
    expect(simulationCadence(1)).toEqual({ intervalMs: 1_700, ticksPerCycle: 1, visualSpeed: 1 });
    expect(simulationCadence(3)).toEqual({ intervalMs: 567, ticksPerCycle: 1, visualSpeed: 3 });
    expect(simulationCadence(5)).toEqual({ intervalMs: 340, ticksPerCycle: 1, visualSpeed: 3 });
    expect(simulationCadence(10)).toEqual({ intervalMs: 340, ticksPerCycle: 1, visualSpeed: 3 });
  });
});
