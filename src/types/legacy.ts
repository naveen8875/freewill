export type WorldTool = "watch" | "build" | "plant" | "terrain" | "people" | "erase";

export interface LegacyAssetDefinition {
  id: string;
  name: string;
  cat: string;
  desc?: string;
  foot: [number, number];
  variants: number;
  frames?: number;
  varNames?: string[];
  [key: string]: unknown;
}

export interface LegacyPreset {
  id: string;
  name: string;
  blurb: string;
  eras?: string[];
  chapters?: string[];
}

export interface LegacySelection {
  type: "villager" | "animal" | "object";
  uid: number;
  title: string;
  eyebrow: string;
  activity: string;
  home: string;
  portrait: string;
  follow: boolean;
  facts?: Array<[string, string]>;
}

export interface LegacyDiaryEntry {
  when: string;
  text: string;
  id: number;
}

export interface RealmStatus {
  year: string;
  chapter: string;
  gov: string;
  headline: string;
  objective: string;
  meters: Array<[string, number]>;
  factions: Array<[string, string, number]>;
  ruler: string;
}

export interface LegacyWorldStatus {
  clock: string;
  phase: string;
  day: number;
  pop: number;
  asleep: number;
  night: boolean;
  season: number;
  seasonName: string;
  weather: string;
  weatherMode: string;
  name: string;
  era?: number;
  eras?: string[] | null;
  chapter?: number;
  chapters?: string[];
  gov?: string;
  realm?: RealmStatus;
  lens?: boolean;
  hasLens?: boolean;
  event?: string;
  hour?: number;
  diary?: LegacyDiaryEntry[];
  routine?: string;
  sel: LegacySelection | null;
  stock: Record<string, number>;
}

export interface LegacyEntity {
  uid: number;
  kind: string;
  name: string;
  job: string;
  activity: string;
  mood?: number;
  trait?: string;
  goal?: string;
  inventory?: Record<string, number>;
  look?: number[];
  initialNeeds?: { hunger: number; fatigue: number; loneliness: number; thirst?: number };
  settlementId?: string;
  relationshipPreset?: "strained" | "neutral" | "friendly";
  likes?: string;
  age?: number;
  carry?: string | null;
  tool?: string | null;
  chop?: LegacyWorldObject | null;
  building?: LegacyWorldObject | null;
  friends?: Record<string, number>;
  spouse?: string;
  inside: boolean;
  x: number;
  y: number;
  speed: number;
  wait?: number;
  path?: Array<[number, number]> | null;
  onArrive?: (() => void) | null;
  home?: LegacyWorldObject | null;
  goTo(x: number, y: number, callback?: () => void): LegacyEntity;
}

export interface LegacyWorldObject {
  uid: number;
  id: string;
  x: number;
  y: number;
  fw: number;
  fh: number;
  build: number;
  [key: string]: unknown;
}

export interface LegacyWorld {
  w: number;
  h: number;
  focus: { x: number; y: number };
  name: string;
  preset: string;
  seed: number;
  day: number;
  time: number;
  hour: number;
  season: number;
  weatherToday: string;
  entities: LegacyEntity[];
  objects: LegacyWorldObject[];
  stock: Record<string, number>;
  version: number;
  tiles: Uint8Array;
  block: Uint16Array | Uint8Array;
  uid: number;
  setTile(x: number, y: number, terrain: number | string): void;
  place(id: string, x: number, y: number, options?: Record<string, unknown>, animate?: boolean): unknown;
  remove(object: LegacyWorldObject): void;
  canPlace(id: string, x: number, y: number, margin?: number): boolean;
  spawn(kind: string, x: number, y: number, options?: Record<string, unknown>): LegacyEntity;
  despawn(entity: LegacyEntity): void;
  door(object: LegacyWorldObject): { x: number; y: number };
  poi(kind: string): Array<LegacyWorldObject | [number, number]>;
  walkable(x: number, y: number): boolean;
}

export interface LegacyGame {
  world: LegacyWorld;
  speed: number;
  tool: WorldTool;
  item: LegacyToolItem | null;
  follow: boolean;
  lens?: boolean;
  externalDecisions?: boolean;
  sel?: LegacyEntity | Record<string, unknown> | null;
  cv: HTMLCanvasElement;
  load(world: LegacyWorld, options?: { hour?: number; season?: number }): void;
  destroy(): void;
  status(): LegacyWorldStatus | null;
  setTool(tool: WorldTool, item?: LegacyToolItem | null): void;
  setSeason(season: number): void;
  setOptions(options: { weather?: string; ambient?: boolean; grid?: boolean; layers?: Partial<Record<"terrain" | "objects" | "people", boolean>> }): void;
  startEvent?(event: string): void;
}

export interface LegacyToolItem {
  id?: string;
  terrain?: number;
  opts?: Record<string, unknown>;
  brush?: number;
  fill?: boolean;
}

export interface LegacyAssets {
  CATS: Array<[string, string]>;
  TERRAIN: string[];
  TNAMES: string[];
  TID: Record<string, number>;
  list(): LegacyAssetDefinition[];
  get(id: string): LegacyAssetDefinition;
  thumb(id: string, options?: Record<string, unknown>, scale?: number, frame?: number): string;
  swatch(terrain: number, scale?: number): string;
}

export interface LegacyLW {
  ready: boolean;
  Assets: LegacyAssets;
  PRESETS: LegacyPreset[];
  EVENTS?: Array<[string, string]>;
  SEASONS: string[];
  Game: new (canvas: HTMLCanvasElement, callbacks?: { onSelect?: () => void; onMutate?: () => void }) => LegacyGame;
  World: new (width: number, height: number, seed: number) => LegacyWorld;
  createWorld(id: string, seed: number, options?: Record<string, unknown>): LegacyWorld;
}

declare global {
  interface Window {
    LW: LegacyLW;
    world?: LegacyWorld;
    game?: LegacyGame;
  }
}
