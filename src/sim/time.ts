/** The smallest authoritative human/world interval. Rendering still runs independently at RAF speed. */
export const SIM_MINUTES_PER_TICK = 30;
export const SIM_TICKS_PER_DAY = 24 * 60 / SIM_MINUTES_PER_TICK;
export const LEGACY_TICK_RATIO = SIM_TICKS_PER_DAY / 12;
export const SIM_START_MINUTE = 8 * 60;

/** Converts durations authored against the original twelve-tick day. */
export function legacyDurationTicks(ticks: number) {
  return Math.max(1, Math.round(ticks * LEGACY_TICK_RATIO));
}

export function simulationDay(tick: number) {
  return 1 + Math.floor(Math.max(0, tick) / SIM_TICKS_PER_DAY);
}

export function simulationMinuteOfDay(tick: number) {
  return (SIM_START_MINUTE + Math.max(0, tick) % SIM_TICKS_PER_DAY * SIM_MINUTES_PER_TICK) % (24 * 60);
}
