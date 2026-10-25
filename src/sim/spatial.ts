export interface TilePoint {
  x: number;
  y: number;
}

export interface SpatialWorldSeed {
  width: number;
  height: number;
  topologyRevision: number;
  walkable: number[];
  moveCost?: number[];
  locations: Record<string, TilePoint[]>;
  environment?: {
    seed: number;
    harshness: "gentle" | "balanced" | "harsh";
    spawn: TilePoint;
    biomes: string[];
    elevation: number[];
    moisture: number[];
    fertility: number[];
    hazard: number[];
  };
}

export interface PhysicalObjectSeed {
  uid: number;
  assetId: string;
  x: number;
  y: number;
  build: number;
  age: number;
  footprint: { width: number; height: number };
  category: string;
  tree: boolean;
  crop?: boolean;
  homeCapacity: number;
  wildResource?: "wood" | "wild-food" | "fiber" | "stone";
}

export interface SimulationWorldSeed extends SpatialWorldSeed {
  nextObjectUid?: number;
  objects?: PhysicalObjectSeed[];
}

export interface SpatialWorldState extends SpatialWorldSeed {
  moveCost: number[];
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [-1, 0], [1, 0], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

export function createOpenSpatialWorld(width = 32, height = 24): SpatialWorldState {
  return {
    width,
    height,
    topologyRevision: 0,
    walkable: Array.from({ length: width * height }, () => 1),
    moveCost: Array.from({ length: width * height }, () => 1_000),
    locations: {},
    environment: undefined,
  };
}

export function normalizeSpatialWorld(seed?: SpatialWorldSeed): SpatialWorldState {
  if (!seed) return createOpenSpatialWorld();
  const size = seed.width * seed.height;
  if (seed.width < 1 || seed.height < 1 || seed.walkable.length !== size) throw new Error("Spatial world dimensions do not match its walkability grid.");
  if (seed.moveCost && seed.moveCost.length !== size) throw new Error("Spatial movement costs do not match world dimensions.");
  return {
    width: seed.width,
    height: seed.height,
    topologyRevision: seed.topologyRevision,
    walkable: seed.walkable.map((value) => value ? 1 : 0),
    moveCost: seed.moveCost?.map((value) => Math.max(1, Math.round(value))) ?? Array.from({ length: size }, () => 1_000),
    locations: Object.fromEntries(Object.entries(seed.locations).map(([key, points]) => [key, points.map((point) => ({ x: Math.trunc(point.x), y: Math.trunc(point.y) }))])),
    environment: seed.environment ? structuredClone(seed.environment) : undefined,
  };
}

export function isWalkable(world: SpatialWorldState, point: TilePoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < world.width && point.y < world.height && world.walkable[point.y * world.width + point.x] === 1;
}

/**
 * Labels every mutually reachable walkable region using the exact same corner
 * rules as findPath. The simulation caches this by topology revision and uses
 * it to avoid presenting physically impossible actions to a decision provider.
 */
export function walkableComponents(world: SpatialWorldState): Int32Array {
  const components = new Int32Array(world.width * world.height);
  components.fill(-1);
  let component = 0;
  for (let start = 0; start < components.length; start += 1) {
    if (!world.walkable[start] || components[start] >= 0) continue;
    components[start] = component;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % world.width;
      const y = Math.floor(current / world.width);
      for (const [dx, dy] of NEIGHBORS) {
        const next = { x: x + dx, y: y + dy };
        if (!isWalkable(world, next)) continue;
        if (dx !== 0 && dy !== 0 && (!isWalkable(world, { x: x + dx, y }) || !isWalkable(world, { x, y: y + dy }))) continue;
        const index = next.y * world.width + next.x;
        if (components[index] >= 0) continue;
        components[index] = component;
        queue.push(index);
      }
    }
    component += 1;
  }
  return components;
}

function nearestWalkable(world: SpatialWorldState, target: TilePoint, start: TilePoint): TilePoint | null {
  if (isWalkable(world, target)) return target;
  let best: TilePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = { x: target.x + dx, y: target.y + dy };
        if (!isWalkable(world, candidate)) continue;
        const distance = dx * dx + dy * dy + Math.abs(candidate.x - start.x) * 0.01 + Math.abs(candidate.y - start.y) * 0.001;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    if (best) break;
  }
  return best;
}

export function findPath(world: SpatialWorldState, from: TilePoint, requestedTarget: TilePoint, maxIterations = 20_000): TilePoint[] | null {
  const start = { x: Math.trunc(from.x), y: Math.trunc(from.y) };
  const target = nearestWalkable(world, { x: Math.trunc(requestedTarget.x), y: Math.trunc(requestedTarget.y) }, start);
  if (!target || !isWalkable(world, start)) return null;
  if (start.x === target.x && start.y === target.y) return [];

  const size = world.width * world.height;
  const costs = new Float64Array(size);
  costs.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(size);
  previous.fill(-1);
  const closed = new Uint8Array(size);
  const startIndex = start.y * world.width + start.x;
  const goalIndex = target.y * world.width + target.x;
  const queue: Array<{ index: number; score: number; order: number }> = [];
  let order = 0;

  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - target.x);
    const dy = Math.abs(y - target.y);
    return 500 * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy));
  };
  const push = (index: number, score: number) => {
    queue.push({ index, score, order: order++ });
    queue.sort((a, b) => a.score - b.score || a.index - b.index || a.order - b.order);
  };

  costs[startIndex] = 0;
  push(startIndex, heuristic(start.x, start.y));
  let iterations = 0;
  while (queue.length && iterations++ < maxIterations) {
    const current = queue.shift();
    if (!current) break;
    if (current.index === goalIndex) break;
    if (closed[current.index]) continue;
    closed[current.index] = 1;
    const x = current.index % world.width;
    const y = Math.floor(current.index / world.width);
    for (const [dx, dy] of NEIGHBORS) {
      const next = { x: x + dx, y: y + dy };
      if (!isWalkable(world, next)) continue;
      if (dx !== 0 && dy !== 0 && (!isWalkable(world, { x: x + dx, y }) || !isWalkable(world, { x, y: y + dy }))) continue;
      const index = next.y * world.width + next.x;
      const step = world.moveCost[index] * (dx !== 0 && dy !== 0 ? 1.414 : 1);
      const cost = costs[current.index] + step;
      if (cost >= costs[index]) continue;
      costs[index] = cost;
      previous[index] = current.index;
      push(index, cost + heuristic(next.x, next.y));
    }
  }
  if (previous[goalIndex] < 0) return null;
  const path: TilePoint[] = [];
  let current = goalIndex;
  while (current !== startIndex && current >= 0) {
    path.push({ x: current % world.width, y: Math.floor(current / world.width) });
    current = previous[current];
  }
  return path.reverse();
}

export function chooseDeterministicPoint(points: readonly TilePoint[], seed: number): TilePoint | null {
  if (!points.length) return null;
  const index = Math.abs(seed) % points.length;
  const point = points[index];
  return { x: point.x, y: point.y };
}
