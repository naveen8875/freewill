import type {
  LegacyAssetDefinition,
  LegacyEntity,
  LegacyGame,
  LegacyPreset,
  LegacyToolItem,
  LegacyWorldObject,
  LegacyWorldStatus,
  WorldTool,
} from "../types/legacy";
import type { DecisionRecord, SimulationSnapshot, SocietyGoalId } from "../sim/types";
import type { SimulationWorldSeed, TilePoint } from "../sim/spatial";
import type { SerializableWorld, WorldDocument } from "../persistence/worldDocument";
import { BUILDINGS, projectProgress } from "../sim/physicalWorld";
import { generateWilderness, type GeneratedWilderness, type WorldHarshness } from "../sim/worldGeneration";
import { legacyDurationTicks, simulationDay, simulationMinuteOfDay } from "../sim/time";

function normalizeVillagerLook(look?: number[]) {
  return Array.from({ length: 7 }, (_, index) => Number.isFinite(look?.[index]) ? Math.trunc(look![index]) : 0);
}

export interface WorldLoadOptions {
  era?: number;
  chapter?: number;
  gov?: "council" | "kingdom" | "republic";
  hour?: number;
  season?: number;
  harshness?: WorldHarshness;
}

export interface AssetCatalogGroup {
  id: string;
  label: string;
  assets: LegacyAssetDefinition[];
}

export interface WorldRenderer {
  readonly canvas: HTMLCanvasElement;
  getStatus(): LegacyWorldStatus | null;
  getPresets(): LegacyPreset[];
  getCatalog(): AssetCatalogGroup[];
  getPeople(): LegacyEntity[];
  getWorld(): LegacyGame["world"];
  getSimulationWorldSeed(): SimulationWorldSeed;
  loadWorld(presetId: string, seed: number, options?: WorldLoadOptions): void;
  loadGeneratedWorld(name: string, seed: number, width: number, height: number, options?: WorldLoadOptions): void;
  setSpeed(speed: number): void;
  setPlaybackCadence(intervalMs: number): void;
  setSeason(season: number): void;
  setWeather(weather: string): void;
  setGrid(visible: boolean): void;
  setTool(tool: WorldTool, item?: LegacyToolItem | null): void;
  setFollow(enabled: boolean): void;
  startEvent(eventId: string): void;
  configureWorld(options: { name: string; population: number; abundance: "scarce" | "balanced" | "abundant"; roster?: Array<{ name: string; job: string; trait: string; goal: string; inventory: Record<string, number>; appearance?: number; initialNeeds?: { hunger: number; fatigue: number; loneliness: number; thirst?: number }; settlementId?: string; relationshipPreset?: "strained" | "neutral" | "friendly" }> }): void;
  selectEntity(uid: number): void;
  applySimulation(snapshot: SimulationSnapshot, decision?: DecisionRecord): void;
  exportDocument(config: {
    presetId: string; seed: number; era: number; chapter: number;
    government: "council" | "kingdom" | "republic"; societyGoal: SocietyGoalId; goalPrompt: string; decisionMode?: "mock" | "local-brain"; weather: string;
    brainDeployment?: WorldDocument["config"]["brainDeployment"];
    simulation: SimulationSnapshot | null;
  }): WorldDocument;
  importDocument(document: WorldDocument): void;
  setEditorState(editor: WorldDocument["editor"]): void;
  destroy(): void;
}

export class LegacyCanvasRenderer implements WorldRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly game: LegacyGame;
  private weather = "auto";
  private grid = false;
  private simulationObjectUids = new Set<number>();
  private lastPhysicalWorldRevision = -1;
  private playbackIntervalMs = 1_700;
  private generatedEnvironment?: GeneratedWilderness;
  private editor: WorldDocument["editor"] = {
    layers: { terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } },
    settlementByCitizen: {}, commandLog: [],
  };

  private applyEditorLayers() {
    this.game.setOptions({ layers: Object.fromEntries(Object.entries(this.editor.layers).map(([name, layer]) => [name, layer.visible])) });
  }

  constructor(canvas: HTMLCanvasElement, onSelect?: () => void, onMutate?: () => void) {
    if (!window.LW?.ready) {
      throw new Error("The freewill world engine did not load.");
    }
    this.canvas = canvas;
    this.game = new window.LW.Game(canvas, { onSelect, onMutate });
    this.game.externalDecisions = true;
  }

  getStatus() {
    return this.game.status();
  }

  getPresets() {
    return window.LW.PRESETS.map((preset) => ({ ...preset }));
  }

  getCatalog(): AssetCatalogGroup[] {
    return window.LW.Assets.CATS.map(([id, label]) => ({
      id,
      label,
      assets: window.LW.Assets.list().filter((asset) => asset.cat === id),
    })).filter((group) => group.assets.length > 0);
  }

  getPeople() {
    return (this.game.world?.entities ?? [])
      .filter((entity) => entity.kind === "villager")
      .map((entity) => ({ ...entity, friends: { ...(entity.friends ?? {}) } }));
  }

  getWorld() {
    return this.game.world;
  }

  getSimulationWorldSeed(): SimulationWorldSeed {
    const world = this.game.world;
    const toPoint = (target: LegacyWorldObject | [number, number]): TilePoint => Array.isArray(target)
      ? { x: Math.trunc(target[0]), y: Math.trunc(target[1]) }
      : world.door(target);
    const poi = (...kinds: string[]) => kinds.flatMap((kind) => world.poi(kind)).map(toPoint);
    const locations: Record<string, TilePoint[]> = {
      food: poi("stores", "bakeries", "taverns", "fires"),
      rest: poi("fires", "plaza"),
      fields: poi("fields", "crops"),
      shore: poi("docks", "shore"),
      sites: poi("sites"),
      plaza: poi("plaza"),
      "job:farmer": poi("fields", "crops"),
      "job:fisher": poi("docks", "shore"),
      "job:woodcutter": poi("trees"),
      "job:builder": poi("sites"),
      "job:miner": poi("mines"),
      "job:smith": poi("smiths"),
      "job:baker": poi("bakeries"),
      "job:merchant": poi("stalls", "stores"),
      "job:innkeeper": poi("taverns"),
      "job:guard": poi("plaza"),
    };
    for (const entity of world.entities) {
      if (entity.kind === "villager" && entity.home) locations[`home:${entity.uid}`] = [world.door(entity.home)];
    }
    const walkable = Array.from({ length: world.w * world.h }, (_, index) => {
      const x = index % world.w;
      const y = Math.floor(index / world.w);
      return world.walkable(x, y) ? 1 : 0;
    });
    const objects = world.objects.map((object) => {
      const definition = window.LW.Assets.get(object.id);
      return {
        uid: object.uid,
        assetId: object.id,
        x: object.x,
        y: object.y,
        build: object.build,
        age: typeof object.age === "number" ? object.age : 0,
        footprint: { width: object.fw, height: object.fh },
        category: definition.cat,
        tree: Boolean(definition.tree),
        crop: Boolean(definition.crop),
        homeCapacity: typeof definition.home === "number" ? definition.home : definition.home ? 2 : 0,
        wildResource: definition.tree ? "wood" as const
          : object.id === "bush" || object.id === "mushroom" ? "wild-food" as const
            : object.id === "reeds" ? "fiber" as const
              : object.id === "rock" || object.id === "stones" ? "stone" as const : undefined,
      };
    });
    const environment = this.generatedEnvironment ? {
      seed: this.generatedEnvironment.seed,
      harshness: this.generatedEnvironment.harshness,
      spawn: { ...this.generatedEnvironment.spawn },
      biomes: this.generatedEnvironment.tiles.map((tile) => tile.biome),
      elevation: this.generatedEnvironment.tiles.map((tile) => tile.elevation),
      moisture: this.generatedEnvironment.tiles.map((tile) => tile.moisture),
      fertility: this.generatedEnvironment.tiles.map((tile) => tile.fertility),
      hazard: this.generatedEnvironment.tiles.map((tile) => tile.hazard),
    } : undefined;
    return { width: world.w, height: world.h, topologyRevision: world.version, walkable, locations, environment, nextObjectUid: world.uid, objects };
  }

  loadWorld(presetId: string, seed: number, options: WorldLoadOptions = {}) {
    this.simulationObjectUids.clear();
    this.lastPhysicalWorldRevision = -1;
    this.generatedEnvironment = undefined;
    const world = window.LW.createWorld(presetId, seed, { ...options });
    this.game.load(world, { hour: options.hour ?? world.hour ?? 8, season: options.season });
    this.game.setOptions({ weather: this.weather, grid: this.grid, ambient: true });
    this.applyEditorLayers();
  }

  loadGeneratedWorld(name: string, seed: number, width: number, height: number, options: WorldLoadOptions = {}) {
    this.simulationObjectUids.clear();
    this.lastPhysicalWorldRevision = -1;
    const plan = generateWilderness(seed, width, height, options.harshness ?? "balanced");
    this.generatedEnvironment = plan;
    const world = new window.LW.World(plan.width, plan.height, seed);
    plan.tiles.forEach((tile, index) => world.setTile(index % plan.width, Math.floor(index / plan.width), tile.terrain));
    world.name = name.trim() || "Generated World";
    world.focus = { ...plan.spawn };
    for (const object of plan.objects) if (world.canPlace(object.assetId, object.x, object.y)) world.place(object.assetId, object.x, object.y, { v: object.variant });
    this.game.load(world, { hour: options.hour ?? 8, season: options.season });
    this.game.setOptions({ weather: this.weather, grid: this.grid, ambient: true });
    this.applyEditorLayers();
  }

  setSpeed(speed: number) {
    // Fast-forward changes logical throughput in useSimulationRuntime. The
    // canvas only needs enough speed to interpolate between published states;
    // driving its full object/particle loop at 10x makes animation less smooth.
    this.game.speed = speed <= 0 ? 0 : Math.min(3, speed);
  }

  setPlaybackCadence(intervalMs: number) {
    this.playbackIntervalMs = Math.max(100, intervalMs);
  }

  setSeason(season: number) {
    this.game.setSeason(season);
  }

  setWeather(weather: string) {
    this.weather = weather;
    this.game.setOptions({ weather });
  }

  setGrid(visible: boolean) {
    this.grid = visible;
    this.game.setOptions({ grid: visible });
  }

  setTool(tool: WorldTool, item: LegacyToolItem | null = null) {
    this.game.setTool(tool, item);
  }

  setFollow(enabled: boolean) {
    this.game.follow = enabled;
  }

  startEvent(eventId: string) {
    this.game.startEvent?.(eventId);
  }

  configureWorld(options: Parameters<WorldRenderer["configureWorld"]>[0]) {
    const world = this.game.world;
    world.name = options.name.trim() || world.name;
    const villagers = world.entities.filter((entity) => entity.kind === "villager");
    while (villagers.length > options.population) {
      const entity = villagers.pop();
      if (entity) world.despawn(entity);
    }
    while (villagers.length < options.population) {
      const index = villagers.length;
      const angle = index * 2.399963;
      const radius = 1 + Math.floor(Math.sqrt(index));
      const x = Math.max(1, Math.min(world.w - 2, Math.round(world.focus.x + Math.cos(angle) * radius)));
      const y = Math.max(1, Math.min(world.h - 2, Math.round(world.focus.y + Math.sin(angle) * radius)));
      const entity = world.spawn("villager", x, y, { job: "unassigned" });
      entity.inventory = {};
      entity.goal = "Survive and decide what kind of life to make";
      villagers.push(entity);
    }
    villagers.forEach((entity, index) => {
      const draft = options.roster?.[index];
      if (!draft) return;
      entity.name = draft.name.trim() || entity.name;
      entity.job = draft.job;
      entity.trait = draft.trait;
      entity.goal = draft.goal;
      entity.inventory = { ...draft.inventory };
      if (draft.appearance !== undefined) entity.look = normalizeVillagerLook([draft.appearance, ...(entity.look ?? []).slice(1)]);
      entity.initialNeeds = draft.initialNeeds ? { ...draft.initialNeeds } : undefined;
      entity.settlementId = draft.settlementId;
      entity.relationshipPreset = draft.relationshipPreset;
    });
    if (this.generatedEnvironment) world.stock = {};
  }

  selectEntity(uid: number) {
    const entity = this.game.world?.entities.find((item) => item.uid === uid);
    if (!entity) return;
    this.game.sel = entity;
    this.game.follow = false;
  }

  applySimulation(snapshot: SimulationSnapshot, _decision?: DecisionRecord) {
    const world = this.game.world;
    if (!world) return;
    const objects = this.syncPhysicalWorld(snapshot);
    world.stock = { ...world.stock, ...snapshot.stock };
    world.day = simulationDay(snapshot.tick);
    world.time = simulationMinuteOfDay(snapshot.tick);
    for (const entity of world.entities) {
      if (entity.kind !== "villager") continue;
      const citizen = snapshot.citizens[entity.uid];
      if (!citizen) continue;
      entity.activity = citizen.currentActivity;
      entity.mood = citizen.happiness;
      entity.inventory = { ...citizen.inventory };
      entity.home = citizen.homeObjectUid ? objects.get(citizen.homeObjectUid) ?? null : null;
      const action = citizen.currentActionId ? snapshot.activeActions[citizen.currentActionId] : undefined;
      entity.tool = action?.phase === "performing" && action.intent?.kind === "fell_tree" ? "axe"
        : action?.phase === "performing" && action.intent?.kind === "quarry_stone" ? "pick"
          : action?.phase === "performing" && (action.intent?.kind === "harvest_crop" || action.intent?.kind === "sow_crop" || action.intent?.kind === "tend_crop") ? "hoe"
            : action?.phase === "performing" && (action.intent?.kind === "work_construction" || action.intent?.kind === "repair_structure" || action.intent?.kind === "demolish_structure") ? "hammer"
              : null;
      entity.chop = action?.intent?.kind === "fell_tree" || action?.intent?.kind === "quarry_stone" ? objects.get(snapshot.physicalWorld.resources[action.intent.nodeId]?.objectUid) ?? null : null;
      entity.building = action?.intent?.kind === "work_construction" ? objects.get(snapshot.physicalWorld.projects[action.intent.projectId]?.objectUid) ?? null
        : action?.intent?.kind === "repair_structure" && action.intent.targetKind === "building" ? objects.get(Number(action.intent.targetId)) ?? null
          : action?.intent?.kind === "demolish_structure" ? objects.get(action.intent.buildingObjectUid) ?? null : null;
      entity.carry = (citizen.inventory.wood ?? 0) > 0 ? "wood" : (citizen.inventory.stone ?? 0) > 0 ? "stone" : (citizen.inventory.water ?? 0) > 0 ? "water" : null;
      if (Math.floor(entity.x) !== citizen.position.x || Math.floor(entity.y) !== citizen.position.y) {
        const travelledRoute = action?.route?.slice(0, action.routeIndex);
        this.routeVisualMovement(entity, citizen.position, travelledRoute);
      }
    }
  }

  private routeVisualMovement(entity: LegacyEntity, target: TilePoint, authoritativeRoute?: TilePoint[]) {
    const existingTarget = entity.path?.at(-1);
    if (existingTarget?.[0] === target.x && existingTarget[1] === target.y) return;

    entity.onArrive = null;
    entity.wait = 0;
    const current = { x: Math.floor(entity.x), y: Math.floor(entity.y) };
    let path: Array<[number, number]> = [];
    if (authoritativeRoute?.length) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      authoritativeRoute.forEach((point, index) => {
        const distance = Math.hypot(point.x - entity.x, point.y - entity.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      path = authoritativeRoute.slice(nearestIndex).map((point) => [point.x, point.y]);
      if (path[0]?.[0] === current.x && path[0]?.[1] === current.y) path.shift();
    }
    // Completed actions no longer carry their route. Build a cheap visual
    // stepping line instead of launching a second A* search on the UI thread.
    let x = path.at(-1)?.[0] ?? current.x;
    let y = path.at(-1)?.[1] ?? current.y;
    while ((x !== target.x || y !== target.y) && path.length < 128) {
      x += Math.sign(target.x - x);
      y += Math.sign(target.y - y);
      path.push([x, y]);
    }
    entity.path = path.length ? path : [[target.x, target.y]];

    let visualX = entity.x;
    let visualY = entity.y;
    let distance = 0;
    for (const [tileX, tileY] of entity.path) {
      const nextX = tileX + 0.5;
      const nextY = tileY + 0.5;
      distance += Math.hypot(nextX - visualX, nextY - visualY);
      visualX = nextX;
      visualY = nextY;
    }
    const seconds = Math.max(0.12, this.playbackIntervalMs / 1_000 * 0.9);
    const canvasMultiplier = Math.max(0.25, this.game.speed);
    // Finish just before the next authoritative state arrives. This lets the
    // legacy RAF walk every route tile instead of snapping to the batch's last
    // coordinate, without slowing the actual society simulation.
    entity.speed = Math.max(1.5, Math.min(24, distance / seconds / canvasMultiplier));
  }

  private syncPhysicalWorld(snapshot: SimulationSnapshot) {
    const world = this.game.world;
    const objects = new Map(world.objects.map((object) => [object.uid, object]));
    if (this.lastPhysicalWorldRevision === snapshot.worldRevision && snapshot.tick % legacyDurationTicks(120) !== 0) {
      // Crop growth is the only continuously changing physical visual. Update
      // those sprites without reconciling every resource/building/road.
      for (const node of Object.values(snapshot.physicalWorld.resources)) {
        if (node.kind !== "crop") continue;
        const object = objects.get(node.objectUid) as (LegacyWorldObject & { age?: number; externallyManaged?: boolean }) | undefined;
        if (!object) continue;
        const progress = node.cropStage === "ripe" ? 1 : node.cropStage === "fallow" || node.cropStage === "withered" ? 0 : node.growth ?? 0;
        object.age = node.status === "available" ? 100 : Math.round(progress * 94);
        object.externallyManaged = true;
      }
      return objects;
    }
    const desiredDynamic = new Set<number>();
    const ensureObject = (uid: number, id: string, x: number, y: number, build = 1) => {
      let object = objects.get(uid);
      if (object && (object.id !== id || object.x !== x || object.y !== y)) {
        world.remove(object);
        objects.delete(uid);
        object = undefined;
      }
      if (!object) {
        object = world.place(id, x, y, {}, false) as LegacyWorldObject;
        object.uid = uid;
        world.uid = Math.max(world.uid, uid + 1);
        objects.set(uid, object);
      }
      object.build = build;
      object._w = 0;
      object.self = false;
      return object;
    };
    for (const node of Object.values(snapshot.physicalWorld.resources)) {
      if (node.status === "depleted" && node.kind === "stone") {
        const object = objects.get(node.objectUid);
        if (object) {
          world.remove(object);
          objects.delete(node.objectUid);
        }
        desiredDynamic.add(node.objectUid);
        continue;
      }
      const desiredId = node.status === "available" || node.kind === "wild-food" || node.kind === "fiber" ? node.assetId : "stump";
      const object = ensureObject(node.objectUid, node.kind === "crop" ? node.assetId : desiredId, node.position.x, node.position.y, 1) as LegacyWorldObject & { age?: number; externallyManaged?: boolean };
      if (node.kind === "crop") {
        const progress = node.cropStage === "ripe" ? 1 : node.cropStage === "fallow" || node.cropStage === "withered" ? 0 : node.growth ?? 0;
        object.age = node.status === "available" ? 100 : Math.round(progress * 94);
        object.externallyManaged = true;
      }
      desiredDynamic.add(node.objectUid);
    }
    for (const project of Object.values(snapshot.physicalWorld.projects)) {
      if (project.status === "cancelled" || project.demolishedAtTick !== undefined) continue;
      if (project.buildingType === "road") {
        if (project.status !== "complete") {
          const marker = ensureObject(project.objectUid, "sign", project.position.x, project.position.y, projectProgress(project));
          marker.externallyManaged = true;
          desiredDynamic.add(project.objectUid);
        }
        continue;
      }
      const definition = BUILDINGS[project.buildingType];
      const condition = snapshot.physicalWorld.buildings[String(project.objectUid)]?.condition ?? 1;
      const object = ensureObject(project.objectUid, definition.assetId, project.position.x, project.position.y, project.status === "complete" ? Math.max(0.35, condition) : projectProgress(project));
      object.externallyManaged = true;
      desiredDynamic.add(project.objectUid);
    }
    for (const building of Object.values(snapshot.physicalWorld.buildings)) {
      const definition = BUILDINGS[building.buildingType];
      const object = ensureObject(building.objectUid, definition.assetId, building.position.x, building.position.y, Math.max(0.35, building.condition));
      object.externallyManaged = true;
      desiredDynamic.add(building.objectUid);
    }
    for (const road of Object.values(snapshot.physicalWorld.roads)) world.setTile(road.position.x, road.position.y, "path");
    for (const uid of this.simulationObjectUids) {
      if (desiredDynamic.has(uid)) continue;
      const object = objects.get(uid);
      if (object) {
        world.remove(object);
        objects.delete(uid);
      }
    }
    this.simulationObjectUids = desiredDynamic;
    this.lastPhysicalWorldRevision = snapshot.worldRevision;
    return objects;
  }

  exportDocument(config: Parameters<WorldRenderer["exportDocument"]>[0]): WorldDocument {
    const world = this.game.world as unknown as SerializableWorld;
    return {
      schemaVersion: 6,
      config: {
        name: world.name,
        presetId: config.presetId,
        seed: config.seed,
        era: config.era,
        chapter: config.chapter,
        government: config.government,
        societyGoal: config.societyGoal,
        goalPrompt: config.goalPrompt,
        decisionMode: config.decisionMode,
        brainDeployment: config.brainDeployment,
        weather: config.weather,
      },
      world: {
        width: world.w,
        height: world.h,
        day: world.day,
        time: world.time,
        season: world.season,
        stock: { ...world.stock },
        tiles: Array.from(world.tiles),
        objects: world.objects.map((object) => ({
          uid: object.uid,
          id: object.id,
          x: object.x,
          y: object.y,
          opts: { ...object.opts },
          build: object.build,
          age: object.age,
        })),
        entities: world.entities.map((entity) => ({
          uid: entity.uid,
          kind: entity.kind,
          x: entity.x,
          y: entity.y,
          name: entity.name,
          job: entity.job,
          look: entity.look ? [...entity.look] : undefined,
          homeUid: entity.home?.uid,
          v: entity.v,
          trait: entity.trait,
          goal: entity.goal,
          inventory: entity.inventory ? { ...entity.inventory } : undefined,
          initialNeeds: entity.initialNeeds ? { ...entity.initialNeeds } : undefined,
          settlementId: entity.settlementId,
          relationshipPreset: entity.relationshipPreset,
        })),
      },
      editor: structuredClone(this.editor),
      simulation: config.simulation ? structuredClone(config.simulation) : null,
    };
  }

  importDocument(document: WorldDocument) {
    this.simulationObjectUids.clear();
    this.generatedEnvironment = undefined;
    if (document.simulation) {
      for (const node of Object.values(document.simulation.physicalWorld.resources)) this.simulationObjectUids.add(node.objectUid);
      for (const project of Object.values(document.simulation.physicalWorld.projects)) this.simulationObjectUids.add(project.objectUid);
      for (const building of Object.values(document.simulation.physicalWorld.buildings)) this.simulationObjectUids.add(building.objectUid);
      for (const demolition of Object.values(document.simulation.physicalWorld.demolitions)) this.simulationObjectUids.add(demolition.buildingObjectUid);
    }
    this.editor = structuredClone(document.editor);
    const base = window.LW.createWorld(document.config.presetId, document.config.seed, {
      era: document.config.era,
      chapter: document.config.chapter,
      gov: document.config.government,
    }) as unknown as SerializableWorld;
    const world = document.config.presetId !== "generated" && base.w === document.world.width && base.h === document.world.height
      ? base
      : new window.LW.World(document.world.width, document.world.height, document.config.seed) as unknown as SerializableWorld;

    for (const entity of [...world.entities]) world.despawn(entity as never);
    for (const object of [...world.objects]) world.remove(object);
    world.tiles.set(document.world.tiles);
    world.name = document.config.name;
    world.day = document.world.day;
    world.time = document.world.time;
    world.season = document.world.season;
    world.stock = { ...document.world.stock };

    const objects = new Map<number, ReturnType<SerializableWorld["place"]>>();
    let nextUid = 1;
    for (const record of document.world.objects) {
      const object = world.place(record.id, record.x, record.y, record.opts) as ReturnType<SerializableWorld["place"]> & { uid: number; build: number; age: number };
      object.uid = record.uid;
      object.build = record.build;
      object.age = record.age;
      objects.set(record.uid, object);
      nextUid = Math.max(nextUid, record.uid + 1);
    }
    for (const record of document.world.entities) {
      const entity = world.spawn(record.kind, Math.floor(record.x), Math.floor(record.y), {
        name: record.name,
        job: record.job,
        look: record.kind === "villager" ? normalizeVillagerLook(record.look) : record.look,
        home: record.homeUid ? objects.get(record.homeUid) : undefined,
        v: record.v,
      }) as typeof world.entities[number];
      entity.uid = record.uid;
      entity.x = record.x;
      entity.y = record.y;
      entity.trait = record.trait;
      entity.goal = record.goal;
      entity.inventory = record.inventory ? { ...record.inventory } : undefined;
      entity.initialNeeds = record.initialNeeds ? { ...record.initialNeeds } : undefined;
      entity.settlementId = record.settlementId;
      entity.relationshipPreset = record.relationshipPreset;
      nextUid = Math.max(nextUid, record.uid + 1);
    }
    world.uid = nextUid;
    this.game.load(world, { hour: document.world.time / 60, season: document.world.season });
    this.setWeather(document.config.weather);
    this.game.setOptions({ grid: this.grid, ambient: true });
    this.applyEditorLayers();
  }

  setEditorState(editor: WorldDocument["editor"]) {
    this.editor = structuredClone(editor);
    this.applyEditorLayers();
  }

  destroy() {
    this.game.destroy();
  }
}
