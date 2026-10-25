import { describe, expect, it } from "vitest";
import { SIM_TICKS_PER_DAY, simulationDay, simulationMinuteOfDay } from "./time";

describe("simulation clock", () => {
  it("advances in half-hour windows from the world's 08:00 start", () => {
    expect(simulationMinuteOfDay(0)).toBe(8 * 60);
    expect(simulationMinuteOfDay(1)).toBe(8 * 60 + 30);
    expect(simulationMinuteOfDay(32)).toBe(0);
    expect(simulationMinuteOfDay(SIM_TICKS_PER_DAY)).toBe(8 * 60);
    expect(simulationDay(SIM_TICKS_PER_DAY - 1)).toBe(1);
    expect(simulationDay(SIM_TICKS_PER_DAY)).toBe(2);
  });
});
