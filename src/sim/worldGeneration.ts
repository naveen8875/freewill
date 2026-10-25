export type BiomeId = "ocean" | "shore" | "grassland" | "forest" | "wetland" | "highland";
export type WorldHarshness = "gentle" | "balanced" | "harsh";

export interface GeneratedTile {
  terrain: "water" | "sand" | "grass" | "meadow";
  biome: BiomeId;
  elevation: number;
  moisture: number;
  fertility: number;
  hazard: number;
  walkable: boolean;
}

export interface WildObjectPlan {
  assetId: "oak" | "pine" | "bush" | "reeds" | "mushroom" | "rock" | "stones";
  x: number;
  y: number;
  variant: number;
}

export interface GeneratedWilderness {
  width: number;
  height: number;
  seed: number;
  harshness: WorldHarshness;
  spawn: { x: number; y: number };
  tiles: GeneratedTile[];
  objects: WildObjectPlan[];
}

function hash(seed: number, x: number, y: number, salt = 0) {
  let value = Math.imul(x + seed * 17 + salt * 101, 0x45d9f3b) ^ Math.imul(y + seed * 31 - salt * 53, 0x119de1f3);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function smooth(seed: number, x: number, y: number, scale: number, salt: number) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const fade = (value: number) => value * value * (3 - 2 * value);
  const a = hash(seed, x0, y0, salt);
  const b = hash(seed, x0 + 1, y0, salt);
  const c = hash(seed, x0, y0 + 1, salt);
  const d = hash(seed, x0 + 1, y0 + 1, salt);
  const top = a + (b - a) * fade(tx);
  const bottom = c + (d - c) * fade(tx);
  return top + (bottom - top) * fade(ty);
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Pure, deterministic world planning. Rendering and simulation both consume this plan. */
export function generateWilderness(seed: number, width = 128, height = 128, harshness: WorldHarshness = "balanced"): GeneratedWilderness {
  const safeWidth = Math.max(32, Math.min(192, Math.trunc(width)));
  const safeHeight = Math.max(24, Math.min(192, Math.trunc(height)));
  const cx = Math.floor(safeWidth / 2);
  const cy = Math.floor(safeHeight / 2);
  const tiles: GeneratedTile[] = [];
  const harshnessBias = harshness === "gentle" ? -0.1 : harshness === "harsh" ? 0.12 : 0;

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const edgeDistance = Math.min(x, y, safeWidth - 1 - x, safeHeight - 1 - y);
      const continental = smooth(seed, x, y, 24, 1) * 0.62 + smooth(seed, x, y, 9, 2) * 0.38;
      const elevation = clamp(continental + Math.min(0.18, edgeDistance / 45) - 0.12);
      const moisture = clamp(smooth(seed, x, y, 18, 3) * 0.72 + smooth(seed, x, y, 6, 4) * 0.28);
      const water = edgeDistance < 2 || elevation < 0.34;
      const shore = !water && elevation < 0.39;
      const biome: BiomeId = water ? "ocean" : shore ? "shore" : elevation > 0.72 ? "highland" : moisture > 0.7 ? "wetland" : moisture > 0.46 ? "forest" : "grassland";
      const fertility = water ? 0 : clamp(moisture * 0.72 + (1 - Math.abs(elevation - 0.5)) * 0.28 - harshnessBias);
      const hazard = clamp((elevation > 0.76 ? 0.32 : 0) + (moisture > 0.78 ? 0.18 : 0) + harshnessBias + hash(seed, x, y, 8) * 0.18);
      tiles.push({ terrain: water ? "water" : shore ? "sand" : biome === "grassland" ? "meadow" : "grass", biome, elevation, moisture, fertility, hazard, walkable: !water });
    }
  }

  const density = harshness === "gentle" ? 0.9 : harshness === "harsh" ? 0.48 : 0.68;
  const provisionalObjects: WildObjectPlan[] = [];
  for (let y = 2; y < safeHeight - 2; y += 1) for (let x = 2; x < safeWidth - 2; x += 1) {
    const tile = tiles[y * safeWidth + x];
    if (!tile.walkable) continue;
    const roll = hash(seed, x, y, 10);
    let assetId: WildObjectPlan["assetId"] | undefined;
    if ((tile.biome === "forest" || tile.biome === "wetland") && roll > 1 - 0.075 * density) assetId = hash(seed, x, y, 11) > 0.42 ? "oak" : "pine";
    else if (tile.biome === "wetland" && roll > 1 - 0.045 * density) assetId = "reeds";
    else if (tile.fertility > 0.55 && roll > 1 - 0.026 * density) assetId = hash(seed, x, y, 12) > 0.28 ? "bush" : "mushroom";
    else if ((tile.biome === "highland" || tile.biome === "grassland") && roll > 1 - 0.022 * density) assetId = hash(seed, x, y, 13) > 0.45 ? "rock" : "stones";
    if (assetId) provisionalObjects.push({ assetId, x, y, variant: Math.floor(hash(seed, x, y, 14) * 3) });
  }

  const ensureResourceClass = (
    ids: WildObjectPlan["assetId"][],
    fallbackId: WildObjectPlan["assetId"],
    tilePredicate: (tile: GeneratedTile) => boolean,
    salt: number,
  ) => {
    const minimum = harshness === "harsh" ? 3 : 6;
    let present = provisionalObjects.filter((object) => ids.includes(object.assetId)).length;
    if (present >= minimum) return;
    const occupied = new Set(provisionalObjects.map((object) => `${object.x},${object.y}`));
    const locations = tiles.flatMap((tile, index) => {
      const x = index % safeWidth;
      const y = Math.floor(index / safeWidth);
      return x >= 2 && y >= 2 && x < safeWidth - 2 && y < safeHeight - 2 && tile.walkable && tilePredicate(tile)
        ? [{ x, y, order: hash(seed, x, y, salt) }]
        : [];
    }).sort((left, right) => right.order - left.order || left.y - right.y || left.x - right.x);
    for (const location of locations) {
      if (present >= minimum) break;
      if (occupied.has(`${location.x},${location.y}`) || provisionalObjects.some((object) => Math.abs(object.x - location.x) + Math.abs(object.y - location.y) < 4)) continue;
      provisionalObjects.push({ assetId: fallbackId, x: location.x, y: location.y, variant: Math.floor(hash(seed, location.x, location.y, salt + 1) * 3) });
      occupied.add(`${location.x},${location.y}`);
      present += 1;
    }
  };
  ensureResourceClass(["oak", "pine"], "oak", (tile) => tile.biome === "forest" || tile.biome === "wetland" || tile.fertility >= 0.5, 31);
  ensureResourceClass(["bush", "mushroom"], "bush", (tile) => tile.fertility >= 0.48, 33);
  ensureResourceClass(["rock", "stones"], "stones", (tile) => tile.biome === "highland" || tile.biome === "grassland", 35);
  ensureResourceClass(["reeds"], "reeds", (tile) => tile.biome === "wetland" || tile.biome === "shore" || tile.moisture >= 0.62, 37);

  const distanceTo = (x: number, y: number, predicate: (object: WildObjectPlan) => boolean) => {
    let nearest = 30;
    for (const object of provisionalObjects) if (predicate(object)) nearest = Math.min(nearest, Math.abs(object.x - x) + Math.abs(object.y - y));
    return nearest;
  };
  const distanceToShore = (x: number, y: number) => {
    let nearest = 30;
    for (let oy = Math.max(0, y - 18); oy <= Math.min(safeHeight - 1, y + 18); oy += 1) for (let ox = Math.max(0, x - 18); ox <= Math.min(safeWidth - 1, x + 18); ox += 1) {
      if (tiles[oy * safeWidth + ox].biome === "shore") nearest = Math.min(nearest, Math.abs(ox - x) + Math.abs(oy - y));
    }
    return nearest;
  };
  const clearingIsWalkable = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > 3) continue;
      if (!tiles[(y + dy) * safeWidth + x + dx]?.walkable) return false;
    }
    return true;
  };
  const candidates = tiles.flatMap((tile, index) => {
    const x = index % safeWidth;
    const y = Math.floor(index / safeWidth);
    if (!tile.walkable || tile.fertility < 0.34 || tile.hazard > 0.72 || x < 3 || y < 3 || x >= safeWidth - 3 || y >= safeHeight - 3 || !clearingIsWalkable(x, y)) return [];
    const water = distanceToShore(x, y);
    const wood = distanceTo(x, y, (object) => object.assetId === "oak" || object.assetId === "pine");
    const food = distanceTo(x, y, (object) => object.assetId === "bush" || object.assetId === "mushroom");
    const stone = distanceTo(x, y, (object) => object.assetId === "rock" || object.assetId === "stones");
    const fiber = distanceTo(x, y, (object) => object.assetId === "reeds");
    const opportunity = [water, wood, food, stone].reduce((score, distance) => score + Math.max(0, 18 - distance) / 18, 0)
      + Math.max(0, 14 - fiber) / 28;
    const score = opportunity * 2.5 + tile.fertility * 0.8 - tile.hazard * 0.45 - (Math.abs(x - cx) + Math.abs(y - cy)) / Math.max(safeWidth, safeHeight) * 0.12;
    return [{ x, y, score, worstEssentialDistance: Math.max(water, wood, food, stone, fiber) }];
  }).sort((left, right) => left.worstEssentialDistance - right.worstEssentialDistance || right.score - left.score || left.y - right.y || left.x - right.x);
  const spawn = candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : { x: cx, y: cy };
  // Arrival is a real natural clearing: nothing occupies the tiles where people
  // first appear. A small deterministic opportunity ring prevents a viable spawn
  // from depending on a single bush or reed patch. These are still ordinary,
  // finite world nodes which people must find, reach, and harvest.
  const objects = provisionalObjects.filter((object) => Math.hypot(object.x - spawn.x, object.y - spawn.y) >= 4);
  const localTargets = harshness === "gentle"
    ? { wood: 4, food: 6, stone: 4, fiber: 4 }
    : harshness === "harsh"
      ? { wood: 1, food: 2, stone: 1, fiber: 1 }
      : { wood: 3, food: 5, stone: 3, fiber: 3 };
  const opportunityClasses = [
    { key: "wood", ids: ["oak", "pine"] as WildObjectPlan["assetId"][], fallback: "oak" as const, target: localTargets.wood, salt: 41, suitable: (tile: GeneratedTile) => tile.biome === "forest" || tile.biome === "wetland" || tile.fertility >= 0.48 },
    { key: "food", ids: ["bush", "mushroom"] as WildObjectPlan["assetId"][], fallback: "bush" as const, target: localTargets.food, salt: 43, suitable: (tile: GeneratedTile) => tile.fertility >= 0.42 },
    { key: "stone", ids: ["rock", "stones"] as WildObjectPlan["assetId"][], fallback: "stones" as const, target: localTargets.stone, salt: 45, suitable: (tile: GeneratedTile) => tile.biome === "highland" || tile.biome === "grassland" || tile.biome === "shore" },
    { key: "fiber", ids: ["reeds"] as WildObjectPlan["assetId"][], fallback: "reeds" as const, target: localTargets.fiber, salt: 47, suitable: (tile: GeneratedTile) => tile.biome === "wetland" || tile.biome === "shore" || tile.moisture >= 0.58 },
  ];
  const localDistance = (object: Pick<WildObjectPlan, "x" | "y">) => Math.abs(object.x - spawn.x) + Math.abs(object.y - spawn.y);
  const occupied = new Set(objects.map((object) => `${object.x},${object.y}`));
  for (const opportunity of opportunityClasses) {
    let present = objects.filter((object) => opportunity.ids.includes(object.assetId) && localDistance(object) <= 14).length;
    if (present >= opportunity.target) continue;
    const locations = tiles.flatMap((tile, index) => {
      const x = index % safeWidth;
      const y = Math.floor(index / safeWidth);
      const distance = Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
      return distance >= 4 && distance <= 14 && tile.walkable && opportunity.suitable(tile)
        ? [{ x, y, order: hash(seed, x, y, opportunity.salt) }]
        : [];
    }).sort((left, right) => right.order - left.order || left.y - right.y || left.x - right.x);
    for (const location of locations) {
      if (present >= opportunity.target) break;
      const key = `${location.x},${location.y}`;
      if (occupied.has(key) || objects.some((object) => Math.abs(object.x - location.x) + Math.abs(object.y - location.y) < 2)) continue;
      objects.push({
        assetId: opportunity.fallback,
        x: location.x,
        y: location.y,
        variant: Math.floor(hash(seed, location.x, location.y, opportunity.salt + 1) * 3),
      });
      occupied.add(key);
      present += 1;
    }
  }
  return { width: safeWidth, height: safeHeight, seed, harshness, spawn, tiles, objects };
}
