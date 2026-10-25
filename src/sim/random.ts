export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: number, ...parts: number[]) {
  let value = seed | 0;
  for (const part of parts) {
    value = Math.imul(value ^ (part | 0), 0x45d9f3b);
    value ^= value >>> 16;
  }
  return value >>> 0;
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
