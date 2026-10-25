import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import {
  reloadWorld,
  selectAsset,
  selectTerrain,
  setWorldGrid,
  setWorldSeason,
  setWorldWeather,
  selectCitizen,
  createConfiguredWorld,
  setTerrainBrush as applyTerrainBrush,
  setTerrainFill as applyTerrainFill,
} from "../state/worldCommands";
import { PixelThumb } from "./PixelThumb";
import type { WorldSaveSummary } from "../persistence/database";
import {
  downloadCurrentWorld,
  duplicateWorld,
  getPersistenceBackend,
  importWorldFile,
  listWorlds,
  loadSavedWorld,
  replaySavedWorld,
  saveCurrentWorld,
} from "../persistence/worldLibrary";
import { getRuntimeStatus, type RuntimeStatus } from "../persistence/serverStorage";
import { snapshotDigest } from "../sim/snapshotDigest";
import { editCurrentSelection, executeEditorCommand } from "../state/worldCommands";
import type { CitizenState, SimulationSnapshot, SocietyGoalId } from "../sim/types";
import { DecisionMapLauncher, EconomyLedger } from "./EconomyLedger";
import { inferSocietyGoal } from "../sim/economy";
import { CivicLedger } from "./CivicLedger";
import { PhysicalWorldLedger } from "./PhysicalWorldLedger";
import { ExperimentsPanel } from "../features/experiments/ExperimentsPanel";

const GOVERNMENTS = [
  ["council", "Council"],
  ["kingdom", "Kingdom"],
  ["republic", "Democracy"],
] as const;

const ROSTER_NAMES = ["Rowan", "Mika", "Sol", "Ines", "Teo", "Lía", "Noor", "Wren", "Paz", "Juno", "Rafa", "Vera", "Mara", "Ezra", "Oki", "Bea"];
const ROSTER_JOBS = ["farmer", "fisher", "woodcutter", "builder", "merchant", "miner", "baker", "smith", "guard", "wanderer"];
const ROSTER_TRAITS = ["Diligent", "Sociable", "Patient", "Curious", "Frugal", "Bold"];
const PERSONAL_GOALS = ["Find a life worth choosing", "Build a secure home", "Become a trusted neighbor", "Master a useful craft", "Explore beyond familiar ground"];
const STARTER_KITS = {
  none: {},
  provisions: { bread: 2, water: 2 },
  tools: { wood: 1, ore: 1 },
  supplies: { wheat: 2, wood: 1 },
} satisfies Record<string, Record<string, number>>;
const NEED_PRESETS = {
  comfortable: { hunger: 0.2, fatigue: 0.15, loneliness: 0.2 },
  hungry: { hunger: 0.72, fatigue: 0.2, loneliness: 0.2 },
  tired: { hunger: 0.2, fatigue: 0.72, loneliness: 0.2 },
  lonely: { hunger: 0.2, fatigue: 0.2, loneliness: 0.72 },
} as const;

interface RosterDraft {
  name: string;
  job: string;
  trait: string;
  goal: string;
  kit: keyof typeof STARTER_KITS;
  appearance: number;
  needs: keyof typeof NEED_PRESETS;
  settlementId: string;
  relationshipPreset: "strained" | "neutral" | "friendly";
}

function makeRoster(count: number): RosterDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    name: ROSTER_NAMES[index % ROSTER_NAMES.length],
    job: ROSTER_JOBS[index % ROSTER_JOBS.length],
    trait: ROSTER_TRAITS[index % ROSTER_TRAITS.length],
    goal: PERSONAL_GOALS[index % PERSONAL_GOALS.length],
    kit: index % 3 === 0 ? "provisions" : "none",
    appearance: index % 4,
    needs: "comfortable",
    settlementId: "founders",
    relationshipPreset: "neutral",
  }));
}

function PanelHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

function SelectionCard() {
  const selection = useAppStore((state) => state.status?.sel);
  const renderer = useAppStore((state) => state.renderer);
  const mode = useAppStore((state) => state.mode);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const [editError, setEditError] = useState("");
  const [settlement, setSettlement] = useState("founders");
  if (!selection) return null;
  return (
    <section className="selection-card">
      <div className="selection-identity">
        <span className="portrait-well"><img src={selection.portrait} alt="" /></span>
        <span>
          <small>{selection.eyebrow}</small>
          <strong>{selection.title}</strong>
        </span>
      </div>
      <p className="selection-activity">{selection.activity}</p>
      <p className="selection-home">{selection.home}</p>
      {selection.facts?.length ? (
        <dl className="fact-list">
          {selection.facts.map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      ) : null}
      {selection.type !== "object" ? (
        <button className="primary-action" onClick={() => renderer?.setFollow(!selection.follow)}>
          {selection.follow ? "Stop following" : "Follow through the village"}
        </button>
      ) : null}
      {mode === "build" ? (
        <div className="selection-editor" aria-label="Selected item editor">
          {(["left", "up", "down", "right"] as const).map((action) => <button key={action} disabled={historicalTick !== null} onClick={() => { try { editCurrentSelection(action); setEditError(""); } catch (cause) { setEditError(cause instanceof Error ? cause.message : "Edit failed."); } }}>{action}</button>)}
          {selection.type === "object" ? <button disabled={historicalTick !== null} onClick={() => editCurrentSelection("rotate")}>rotate</button> : null}
          <button disabled={historicalTick !== null} onClick={() => editCurrentSelection("delete")}>delete</button>
          {editError ? <p role="alert">{editError}</p> : null}
        </div>
      ) : null}
      {mode === "build" && selection.type === "villager" ? <div className="settlement-editor"><input aria-label="Settlement membership" value={settlement} onChange={(event) => setSettlement(event.target.value)} /><button disabled={historicalTick !== null} onClick={() => { try { executeEditorCommand({ id: `settlement-${selection.uid}-${settlement}`, type: "assign-settlement", citizenId: selection.uid, settlementId: settlement }); setEditError(""); } catch (cause) { setEditError(cause instanceof Error ? cause.message : "Assignment failed."); } }}>Assign settlement</button></div> : null}
    </section>
  );
}

function WorldsPanel() {
  const presets = useAppStore((state) => state.presets);
  const presetId = useAppStore((state) => state.presetId);
  const seed = useAppStore((state) => state.seed);
  const era = useAppStore((state) => state.era);
  const chapter = useAppStore((state) => state.chapter);
  const government = useAppStore((state) => state.government);
  const decisionMode = useAppStore((state) => state.decisionMode);
  const setDecisionMode = useAppStore((state) => state.setDecisionMode);
  const closePanel = useAppStore((state) => state.closePanel);
  const status = useAppStore((state) => state.status);
  const persistenceError = useAppStore((state) => state.persistenceError);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const grid = useAppStore((state) => state.grid);
  const [seedDraft, setSeedDraft] = useState(String(seed));
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("New Aster");
  const [population, setPopulation] = useState(12);
  const [abundance, setAbundance] = useState<"scarce" | "balanced" | "abundant">("balanced");
  const [newSocietyGoal] = useState<SocietyGoalId>("none");
  const [goalPrompt] = useState("");
  const worldSource = "generated" as const;
  const [creatorPreset, setCreatorPreset] = useState(presetId);
  const [generatedSize, setGeneratedSize] = useState("128x128");
  const [harshness, setHarshness] = useState<"gentle" | "balanced" | "harsh">("balanced");
  const [roster, setRoster] = useState<RosterDraft[]>(() => makeRoster(12));
  const [saves, setSaves] = useState<WorldSaveSummary[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [saveNote, setSaveNote] = useState<string>("");
  const importRef = useRef<HTMLInputElement>(null);
  const preset = presets.find((item) => item.id === presetId);

  const refreshSaves = () => void listWorlds().then(setSaves).catch((cause) => setSaveNote(cause instanceof Error ? cause.message : "Could not read saved worlds."));
  useEffect(() => { refreshSaves(); void getRuntimeStatus().then(setRuntime); }, []);
  useEffect(() => setRoster((current) => Array.from({ length: population }, (_, index) => current[index] ?? makeRoster(population)[index])), [population]);
  const updateRoster = (index: number, update: Partial<RosterDraft>) => setRoster((current) => current.map((citizen, citizenIndex) => citizenIndex === index ? { ...citizen, ...update } : citizen));
  const randomizeRoster = () => setRoster((current) => current.map((citizen, index) => ({
    ...citizen,
    name: ROSTER_NAMES[(Math.floor(Math.random() * ROSTER_NAMES.length) + index) % ROSTER_NAMES.length],
    job: ROSTER_JOBS[Math.floor(Math.random() * ROSTER_JOBS.length)],
    trait: ROSTER_TRAITS[Math.floor(Math.random() * ROSTER_TRAITS.length)],
    goal: PERSONAL_GOALS[Math.floor(Math.random() * PERSONAL_GOALS.length)],
    kit: Object.keys(STARTER_KITS)[Math.floor(Math.random() * Object.keys(STARTER_KITS).length)] as RosterDraft["kit"],
  })));

  return (
    <>
      <PanelHeader title="Choose a world" detail={`${presets.length} places, each with its own rhythm.`} />
      <button className="new-world-action" onClick={() => setCreating((value) => !value)}>{creating ? "Close world creator" : "+ Generate a new world"}</button>
      {creating ? (
        <section className="world-creator-form">
          <label><span>World name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
          <label><span>World seed</span><input inputMode="numeric" value={seedDraft} onChange={(event) => setSeedDraft(event.target.value)} /></label>
          <label><span>World dimensions</span><select value={generatedSize} onChange={(event) => setGeneratedSize(event.target.value)}><option value="64x64">Small · 64 × 64</option><option value="96x96">Standard · 96 × 96</option><option value="128x128">Living world · 128 × 128</option><option value="160x160">Expansive · 160 × 160</option></select></label>
          <label><span>Starting population</span><input type="range" min="3" max="100" value={population} onChange={(event) => setPopulation(Number(event.target.value))} /><output>{population}</output></label>
          <label><span>Environmental harshness</span><select value={harshness} onChange={(event) => { const next = event.target.value as typeof harshness; setHarshness(next); setAbundance(next === "gentle" ? "abundant" : next === "harsh" ? "scarce" : "balanced"); }}><option value="gentle">Gentle · plentiful wild resources</option><option value="balanced">Balanced · survival takes work</option><option value="harsh">Harsh · sparse and dangerous</option></select></label>
          <label><span>Decision mind</span><select value={decisionMode} onChange={(event) => setDecisionMode(event.target.value as "mock" | "local-brain")}><option value="local-brain">Local evolving neural brains</option><option value="mock">Local lab simulation</option></select></label>
          <p>Everyone arrives with empty hands, no jobs, no government, no currency, and no shared goal. Their traits and experiences determine what happens next.</p>
          <button className="primary-action" onClick={() => { const [width, height] = generatedSize.split("x").map(Number); createConfiguredWorld({ name: newName, presetId: "generated", seed: Number(seedDraft) || seed, population, abundance, harshness, government: "council", societyGoal: "none", goalPrompt: "", generatedSize: { width, height }, roster: roster.map(({ name, appearance }) => ({ name, job: "unassigned", trait: "", goal: "Survive, learn this place, and choose a life", inventory: {}, appearance, initialNeeds: { hunger: 0.28, fatigue: 0.18, loneliness: 0.25, thirst: 0.28 } })) }); setCreating(false); closePanel(); }}>Generate wilderness</button>
        </section>
      ) : null}
      <div className="preset-list">
        {presets.map((item) => (
          <button
            key={item.id}
            className={presetId === item.id ? "is-active" : ""}
            onClick={() => reloadWorld({ presetId: item.id, ...(item.id === "copperfield" ? { societyGoal: "market-economy" as const } : {}) })}
          >
            <span><strong>{item.name}</strong><small>{item.blurb}</small></span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      {preset?.eras?.length ? (
        <section className="control-section">
          <h3>Riverbend era</h3>
          <div className="segmented-grid">
            {preset.eras.map((name, index) => (
              <button key={name} className={era === index ? "is-active" : ""} onClick={() => reloadWorld({ era: index })}>{name}</button>
            ))}
          </div>
        </section>
      ) : null}

      {preset?.chapters?.length ? (
        <section className="control-section">
          <h3>Chronicle of Aster</h3>
          <div className="chapter-grid">
            {preset.chapters.map((name, index) => (
              <button key={name} className={chapter === index ? "is-active" : ""} onClick={() => reloadWorld({ chapter: index })}>
                <span>{index + 1}</span>{name}
              </button>
            ))}
          </div>
          <h3>Legacy preset governance</h3>
          <div className="segmented-grid three">
            {GOVERNMENTS.map(([id, label]) => (
              <button key={id} className={government === id ? "is-active" : ""} onClick={() => reloadWorld({ government: id })}>{label}</button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="control-section">
        <h3>Generation seed</h3>
        <div className="seed-row">
          <input value={seedDraft} inputMode="numeric" onChange={(event) => setSeedDraft(event.target.value)} aria-label="World seed" />
          <button onClick={() => reloadWorld({ seed: Number(seedDraft) || 7 })}>Grow world</button>
          <button onClick={() => { const next = Math.floor(Math.random() * 1_000_000); setSeedDraft(String(next)); reloadWorld({ seed: next }); }}>Reroll</button>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={grid} onChange={(event) => setWorldGrid(event.target.checked)} />
          <span>Show tile grid</span>
        </label>
      </section>

      <section className="control-section world-library">
        <div className="world-library-heading">
          <h3>World library</h3>
          <div className="runtime-pills" aria-label="Server runtime status">
            <span data-ready={runtime?.storage === "postgres"}>{runtime?.storage === "postgres" ? "PostgreSQL" : "Browser backup"}</span>
            <span data-ready={decisionMode === "local-brain"}>{decisionMode === "local-brain" ? "Local brains" : "Local lab"}</span>
          </div>
        </div>
        {runtime?.dashboardUrl ? <a className="database-dashboard-link" href={runtime.dashboardUrl} target="_blank" rel="noreferrer">Open database dashboard ↗</a> : null}
        {runtime?.database.history ? <p className="save-note">History store · {runtime.database.history.decisions} decisions · {runtime.database.history.events} events · {runtime.database.history.checkpoints} checkpoints</p> : null}
        <div className="library-actions">
          <button disabled={historicalTick !== null} title={historicalTick !== null ? "Return to the live world before saving" : undefined} onClick={() => void saveCurrentWorld().then(() => { setSaveNote(getPersistenceBackend() === "postgres" ? "Saved to PostgreSQL" : "Saved locally"); refreshSaves(); void getRuntimeStatus().then(setRuntime); }).catch((cause) => setSaveNote(cause instanceof Error ? cause.message : "Save failed."))}>Save now</button>
          <button disabled={historicalTick !== null} title={historicalTick !== null ? "Return to the live world before exporting" : undefined} onClick={downloadCurrentWorld}>Export JSON</button>
          <button onClick={() => importRef.current?.click()}>Import</button>
          <button onClick={() => reloadWorld()}>Reset preset</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void importWorldFile(file).then((save) => loadSavedWorld(save.id)).then(() => { setSaveNote("Imported and loaded"); refreshSaves(); }).catch((cause) => setSaveNote(cause instanceof Error ? cause.message : "Import failed.")); event.target.value = ""; }} />
        </div>
        {saveNote ? <p className="save-note" role="status">{saveNote}</p> : null}
        {persistenceError ? <p className="save-error" role="alert">Autosave paused: {persistenceError}</p> : null}
        <div className="saved-world-list">
          {saves.map((save) => (
            <article key={save.id}>
              <button onClick={() => void loadSavedWorld(save.id).then(() => setSaveNote(`Loaded ${save.name}`)).catch((cause) => setSaveNote(cause instanceof Error ? cause.message : "Load failed."))}>
                <strong>{save.name}</strong><small>{save.presetId} · seed {save.seed} · {new Date(save.updatedAt).toLocaleDateString()}</small>
              </button>
              <button className="replay-world-button" aria-label={`Replay ${save.name}`} title="Replay from the beginning" onClick={() => void replaySavedWorld(save.id).then(() => setSaveNote(`Replaying ${save.name}`)).catch((cause) => setSaveNote(cause instanceof Error ? cause.message : "Replay failed."))}>▶</button>
              <button aria-label={`Duplicate ${save.name}`} title="Duplicate" onClick={() => void duplicateWorld(save.id).then(() => { setSaveNote(`Duplicated ${save.name}`); refreshSaves(); })}>⧉</button>
            </article>
          ))}
          {!saves.length ? <p>Your first autosave will appear here after a few moments.</p> : null}
        </div>
      </section>

      <section className="world-atmosphere">
        <div><span>Season</span><strong>{status?.seasonName ?? "Summer"}</strong></div>
        <div className="season-row">
          {window.LW.SEASONS.map((name, index) => (
            <button key={name} className={status?.season === index ? "is-active" : ""} onClick={() => setWorldSeason(index)}>{name.slice(0, 3)}</button>
          ))}
        </div>
        <div><span>Weather</span><strong>{status?.weather ?? "Clear"}</strong></div>
        <div className="weather-row">
          {["auto", "clear", "rain", "snow", "fog", "storm"].map((name) => (
            <button key={name} className={status?.weatherMode === name ? "is-active" : ""} onClick={() => setWorldWeather(name)}>{name}</button>
          ))}
        </div>
      </section>
    </>
  );
}

function KnownWorldMap({ citizen, simulation }: { citizen: CitizenState; simulation: SimulationSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const discoveredKey = citizen.knowledge?.discoveredTiles.join("|") ?? "";
  const resourcesKey = citizen.knowledge?.knownResources.join("|") ?? "";

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = 480;
    const height = 220;
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#15251d";
    context.fillRect(0, 0, width, height);

    const tiles = (citizen.knowledge?.discoveredTiles ?? []).flatMap((key) => {
      const [x, y] = key.split(",").map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
    });
    if (!tiles.length) {
      context.fillStyle = "#9aae99";
      context.font = "20px monospace";
      context.textAlign = "center";
      context.fillText("UNEXPLORED", width / 2, height / 2);
      return;
    }

    const padding = 5;
    const minX = Math.max(0, Math.min(...tiles.map((tile) => tile.x)) - padding);
    const maxX = Math.min(simulation.topology.width - 1, Math.max(...tiles.map((tile) => tile.x)) + padding);
    const minY = Math.max(0, Math.min(...tiles.map((tile) => tile.y)) - padding);
    const maxY = Math.min(simulation.topology.height - 1, Math.max(...tiles.map((tile) => tile.y)) + padding);
    const scale = Math.max(1, Math.min(width / Math.max(1, maxX - minX + 1), height / Math.max(1, maxY - minY + 1)));
    const offsetX = (width - (maxX - minX + 1) * scale) / 2;
    const offsetY = (height - (maxY - minY + 1) * scale) / 2;
    const biomeColors: Record<string, string> = {
      forest: "#587a4b",
      plains: "#8a9d55",
      meadow: "#95a960",
      wetland: "#4f7870",
      shore: "#b1a56f",
      water: "#416978",
      highland: "#716e5c",
      rocky: "#777365",
    };
    for (const tile of tiles) {
      const index = tile.y * simulation.topology.width + tile.x;
      const biome = simulation.topology.environment?.biomes[index] ?? "plains";
      context.fillStyle = biomeColors[biome] ?? "#758b55";
      context.fillRect(offsetX + (tile.x - minX) * scale, offsetY + (tile.y - minY) * scale, Math.ceil(scale), Math.ceil(scale));
    }

    const knownResources = new Set(citizen.knowledge?.knownResources ?? []);
    const resourceColors: Record<string, string> = { tree: "#244b2d", stone: "#bbb6a8", crop: "#e5be49", "wild-food": "#e37965", fiber: "#d4d08a" };
    for (const node of Object.values(simulation.physicalWorld.resources)) {
      if (!knownResources.has(node.id) || node.status === "depleted") continue;
      if (node.position.x < minX || node.position.x > maxX || node.position.y < minY || node.position.y > maxY) continue;
      context.fillStyle = resourceColors[node.kind] ?? "#fff1b4";
      context.fillRect(offsetX + (node.position.x - minX) * scale, offsetY + (node.position.y - minY) * scale, Math.max(2, Math.ceil(scale)), Math.max(2, Math.ceil(scale)));
    }

    const personX = offsetX + (citizen.position.x - minX + 0.5) * scale;
    const personY = offsetY + (citizen.position.y - minY + 0.5) * scale;
    context.fillStyle = "#fff7d2";
    context.beginPath();
    context.arc(personX, personY, Math.max(3, scale * 0.7), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#3b2b23";
    context.lineWidth = 2;
    context.stroke();
  }, [citizen.id, citizen.position.x, citizen.position.y, discoveredKey, resourcesKey, simulation]);

  return (
    <div className="known-world-map">
      <canvas ref={canvasRef} aria-label={`${citizen.name}'s personally discovered map`} />
      <small><i className="self-dot" /> {citizen.name}<i className="food-dot" /> food<i className="material-dot" /> materials · blank space is unknown</small>
    </div>
  );
}

function PeoplePanel() {
  const renderer = useAppStore((state) => state.renderer);
  const status = useAppStore((state) => state.status);
  const people = renderer?.getPeople() ?? [];
  const simulation = useAppStore((state) => state.simulation);
  const selectedId = useAppStore((state) => state.status?.sel?.type === "villager" ? state.status.sel.uid : state.selectedCitizenId);
  const selected = selectedId != null ? simulation?.citizens[selectedId] : null;
  const latestDecision = selected ? simulation?.decisions.find((decision) => decision.citizenId === selected.id) : undefined;
  const groups = selected?.groupIds?.flatMap((id) => simulation?.socialGroups[id] ? [simulation.socialGroups[id]] : []) ?? [];
  const profileRows = (profile: object | undefined) => (Object.entries(profile ?? {}) as Array<[string, number]>).sort(([, left], [, right]) => right - left);
  return (
    <>
      <PanelHeader title="People of this world" detail={`${people.length} lives unfolding on day ${status?.day ?? 1}.`} />
      {selected && simulation ? (
        <section className="citizen-dossier">
          <div className="dossier-title">
            <PixelThumb asset="villager" scale={4} />
            <span><small>{selected.job}</small><h3>{selected.name}</h3><p>{selected.goal}</p></span>
          </div>
          <div className="trait-row">{selected.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
          <div className="need-grid">
            {Object.entries(selected.needs).map(([name, value]) => (
              <div key={name}><span>{name}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{Math.round(value * 100)}</strong></div>
            ))}
          </div>
          <dl className="fact-list">
            <div><dt>Happiness</dt><dd>{Math.round(selected.happiness * 100)}%</dd></div>
            <div><dt>Now</dt><dd>{selected.currentActivity}</dd></div>
            {selected.mind ? <div><dt>Mind</dt><dd>{selected.mind.mode}{selected.mind.currentIntention ? ` · ${selected.mind.currentIntention.label} (${Math.round(selected.mind.currentIntention.commitmentStrength * 100)}% resolve)` : ""}{selected.mind.interruptReason ? ` · ${selected.mind.interruptReason}` : ""}</dd></div> : null}
            {selected.commitment ? <div><dt>Commitment</dt><dd>{selected.commitment.objective} · {selected.commitment.status} · {Math.round(selected.commitment.progress * 100)}%</dd></div> : null}
            <div><dt>Body</dt><dd>{selected.physical?.alive === false ? "Dead" : `${selected.physical?.incapacitatedSinceTick !== undefined ? `Collapsed since T${selected.physical.incapacitatedSinceTick} · ` : ""}${Math.round((selected.physical?.health ?? 1) * 100)}% health · ${Math.round((selected.physical?.exposure ?? 0) * 100)}% exposure`}</dd></div>
            <div><dt>Belonging</dt><dd>{selected.householdId ? "Household member" : "No household"}{groups.length ? ` · ${groups.map((group) => group.name).join(", ")}` : " · No group"}</dd></div>
          </dl>
          {latestDecision ? <button className="dossier-decision" onClick={() => useAppStore.getState().setPanel("decisions")}><span>Last meaningful choice</span><strong>{latestDecision.selectedLabel}</strong><small>{latestDecision.actionStatus} · {latestDecision.provider.label}</small></button> : null}
          <details className="human-profile" open>
            <summary>Personality</summary>
            <div className="profile-meter-grid">{profileRows(selected.personality).map(([name, value]) => <div key={name}><span>{name.replaceAll(/([A-Z])/g, " $1")}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{Math.round(value * 100)}</strong></div>)}</div>
          </details>
          <details className="human-profile">
            <summary>Values and emotions</summary>
            <h4>What matters</h4>
            <div className="profile-meter-grid">{profileRows(selected.values).map(([name, value]) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{Math.round(value * 100)}</strong></div>)}</div>
            <h4>Right now</h4>
            <div className="profile-meter-grid emotions">{profileRows(selected.emotions).map(([name, value]) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{Math.round(value * 100)}</strong></div>)}</div>
          </details>
          <section className="knowledge-card">
            <h3>Known world</h3>
            <KnownWorldMap citizen={selected} simulation={simulation} />
            <div><span><strong>{selected.knowledge?.discoveredTiles.length ?? 0}</strong> tiles seen</span><span><strong>{selected.knowledge?.knownResources.length ?? 0}</strong> resources known</span><span><strong>{selected.knowledge?.knownPeople.length ?? 0}</strong> people met</span></div>
            <p>{selected.knowledge?.learnedTechniques.length ? selected.knowledge.learnedTechniques.map((item) => item.replaceAll("-", " ")).join(" · ") : "No learned techniques yet."}</p>
          </section>
          <div className="inventory-row">
            <h3>Learned skills</h3>
            <div>{Object.entries(selected.skills).sort(([, left], [, right]) => right.level - left.level).map(([skill, state]) => <span key={skill}>{skill} <strong>{Math.round(state.level * 100)}</strong></span>)}{!Object.keys(selected.skills).length ? <small>No practiced trade yet</small> : null}</div>
          </div>
          <div className="inventory-row">
            <h3>Inventory</h3>
            <div>{Object.entries(selected.inventory).map(([item, amount]) => <span key={item}>{item} <strong>{amount}</strong></span>)}{!Object.keys(selected.inventory).length ? <small>Empty pockets</small> : null}</div>
          </div>
          {Object.keys(selected.socialRelationships ?? selected.relationships).length ? (
            <div className="relationship-list">
              <h3>Relationships</h3>
              {Object.entries(selected.socialRelationships ?? {}).sort(([, left], [, right]) => right.trust - left.trust).slice(0, 6).map(([id, relation]) => (
                <div key={id}><span>{simulation?.citizens[Number(id)]?.name ?? `Citizen ${id}`}</span><strong>{Math.round(relation.trust * 100)} trust · {Math.round(relation.respect * 100)} respect{relation.debt ? ` · ${relation.debt} debt` : ""}{relation.grievance ? ` · ${Math.round(relation.grievance * 100)} grievance` : ""}</strong></div>
              ))}
            </div>
          ) : null}
          <div className="memory-list">
            <h3>Recent memories</h3>
            {selected.memories.slice(0, 6).map((memory) => <p key={memory.id} data-tone={memory.tone}><span>{memory.text}</span>{memory.salience !== undefined ? <strong>{Math.round(memory.salience * 100)}</strong> : null}</p>)}
            {!selected.memories.length ? <p>New memories will form as decisions play out.</p> : null}
          </div>
        </section>
      ) : <SelectionCard />}
      <div className="people-list">
        {people.map((person) => (
          <button className={selectedId === person.uid ? "is-active" : ""} key={person.uid} onClick={() => selectCitizen(person.uid)}>
            <PixelThumb asset="villager" scale={3} />
            <span><strong>{person.name}</strong><small>{person.job} · {simulation?.citizens[person.uid]?.currentActivity ?? person.activity}</small></span>
            <span className="mood-dot" data-mood={(simulation?.citizens[person.uid]?.happiness ?? person.mood ?? 0.7) > 0.55 ? "good" : "low"} title="Mood" />
          </button>
        ))}
      </div>
      <p className="panel-note">Select a villager in the world to inspect their personality, home, relationships, and current activity.</p>
    </>
  );
}

const SURVIVAL_FOOD = ["cooked_meal", "berries", "meat", "bread", "fish", "wheat", "cabbage", "pumpkin"];

function WildernessDashboard({ simulation }: { simulation: NonNullable<ReturnType<typeof useAppStore.getState>["simulation"]> }) {
  const citizens = Object.values(simulation.citizens);
  const living = citizens.filter((citizen) => citizen.physical?.alive !== false);
  const food = living.reduce((sum, citizen) => sum + SURVIVAL_FOOD.reduce((total, resource) => total + (citizen.inventory[resource] ?? 0), 0), 0)
    + SURVIVAL_FOOD.reduce((sum, resource) => sum + (simulation.stock[resource] ?? 0), 0);
  const water = living.reduce((sum, citizen) => sum + (citizen.inventory.water ?? 0), 0) + (simulation.stock.water ?? 0);
  const sheltered = living.filter((citizen) => citizen.homeObjectUid !== undefined).length;
  const collapsed = living.filter((citizen) => citizen.physical?.incapacitatedSinceTick !== undefined).length;
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const health = average(living.map((citizen) => citizen.physical?.health ?? 1));
  const mood = average(living.map((citizen) => citizen.happiness));
  const renewables = Object.values(simulation.physicalWorld.renewableStocks);
  const sustainability = average(renewables.filter((stock) => stock.capacity > 0).map((stock) => stock.amount / stock.capacity));
  const modelDecisions = simulation.decisions.filter((decision) => decision.provider.id !== "commitment-engine");
  const engineSteps = simulation.decisions.length - modelDecisions.length;
  const failedCalls = simulation.requests.filter((request) => ["discarded", "timed-out", "fallback", "cancelled"].includes(request.status)).length;
  const cost = simulation.decisions.reduce((sum, decision) => sum + (decision.providerSignals?.kind === "external" ? decision.providerSignals.costUsd ?? 0 : 0), 0);
  const groups = Object.values(simulation.socialGroups).sort((left, right) => right.memberIds.length - left.memberIds.length);
  const openPromises = Object.values(simulation.socialPromises).filter((promise) => promise.status === "open").length;
  const brokenPromises = Object.values(simulation.socialPromises).filter((promise) => promise.status === "broken").length;
  const institution = simulation.politics.institutionStage === "none" ? "None" : simulation.politics.institutionStage === "founding" ? "Being founded" : simulation.politics.administration.form.replaceAll("-", " ");
  const gauges: Array<[string, number, string]> = [
    ["Health", health, `${Math.round(health * 100)}%`],
    ["Mood", mood, `${Math.round(mood * 100)}%`],
    ["Shelter", living.length ? sheltered / living.length : 0, `${sheltered}/${living.length}`],
    ["Renewables", sustainability, `${Math.round(sustainability * 100)}%`],
  ];
  return (
    <div className="wilderness-dashboard">
      <section className="survival-scoreboard">
        <div><span>Alive</span><strong>{living.length}</strong><small>{citizens.length - living.length} deaths · {collapsed} collapsed</small></div>
        <div><span>Food held</span><strong>{food}</strong><small>{living.length ? (food / living.length).toFixed(1) : "0"} each</small></div>
        <div><span>Water held</span><strong>{water}</strong><small>{Math.floor(simulation.physicalWorld.renewableStocks.water?.amount ?? 0)} natural</small></div>
        <div><span>Groups</span><strong>{groups.length}</strong><small>{new Set(citizens.flatMap((citizen) => citizen.householdId ? [citizen.householdId] : [])).size} households</small></div>
      </section>
      <section className="survival-gauges">
        {gauges.map(([label, value, display]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{display}</strong></div>)}
      </section>
      <section className="emergence-ledger">
        <header><h3>What has emerged</h3><small>No outcome was assigned at spawn</small></header>
        <dl>
          <div><dt>Institution</dt><dd>{institution}</dd></div>
          <div><dt>Resource claims</dt><dd>{Object.keys(simulation.physicalWorld.claims).length}</dd></div>
          <div><dt>Promises</dt><dd>{openPromises} open · {brokenPromises} broken</dd></div>
          <div><dt>Occupations</dt><dd>{new Set(living.filter((citizen) => citizen.job !== "unassigned").map((citizen) => citizen.job)).size}</dd></div>
        </dl>
        {groups.map((group) => <article key={group.id}><span><strong>{group.name}</strong><small>{group.memberIds.length} members · {group.decisionSystem}</small></span><em>{Object.values(group.sharedInventory).reduce((sum, amount) => sum + amount, 0)} shared</em></article>)}
        {!groups.length ? <p>No persistent group has formed. Cooperation remains personal and temporary.</p> : null}
      </section>
      <section className="ai-ledger">
        <header><h3>Decision engine</h3><small>Meaningful choices, deterministic execution</small></header>
        <div><span><strong>{modelDecisions.length}</strong> model choices</span><span><strong>{engineSteps}</strong> engine substeps</span><span><strong>{failedCalls}</strong> failed calls</span><span><strong>${cost.toFixed(4)}</strong> recorded cost</span></div>
      </section>
    </div>
  );
}

function CivilizationPanel() {
  const status = useAppStore((state) => state.status);
  const realm = status?.realm;
  const simulation = useAppStore((state) => state.simulation);
  const societyGoal = useAppStore((state) => state.societyGoal);
  const stock = simulation?.stock ?? status?.stock ?? {};
  const resources = ["wheat", "fish", "wood", "stone", "ore", "bread", "water"];
  if (societyGoal === "market-economy" || simulation?.civilizationGoal.id === "market-economy") {
    return (
      <>
        <PanelHeader title={`${status?.name ?? "Settlement"} ledger`} detail="See the institutions citizens built, who owns what, and the choices that led here." />
        {simulation ? <PhysicalWorldLedger simulation={simulation} /> : null}
        {simulation ? <CivicLedger simulation={simulation} /> : null}
        <EconomyLedger simulation={simulation} />
      </>
    );
  }
  if (simulation?.civilizationGoal.id === "none") {
    return (
      <>
        <PanelHeader title="World pulse" detail="Survival, relationships, and institutions as they actually emerged." />
        <WildernessDashboard simulation={simulation} />
        <PhysicalWorldLedger simulation={simulation} />
        <CivicLedger simulation={simulation} />
        <DecisionMapLauncher simulation={simulation} label="Trace how this world happened" />
      </>
    );
  }
  return (
    <>
      <PanelHeader title={realm?.gov ?? "Settlement ledger"} detail={realm?.headline ?? "What the village has made together."} />
      {simulation ? <CivicLedger simulation={simulation} /> : null}
      {simulation ? <PhysicalWorldLedger simulation={simulation} /> : null}
      {simulation ? <DecisionMapLauncher simulation={simulation} label="Open decision history" /> : null}
      {realm ? (
        <section className="realm-card">
          <div className="realm-year">{realm.chapter} · {realm.year}</div>
          <h3>{realm.objective}</h3>
          <div className="meter-list">
            {realm.meters.map(([label, value], index) => (
              <div key={label}><span>{label}</span><i><b style={{ width: `${Math.round(value * 100)}%`, background: ["#e0a52a", "#2f7fc7", "#4f8e36", "#c96b43"][index] }} /></i><strong>{Math.round(value * 100)}</strong></div>
            ))}
          </div>
          <div className="faction-stack">
            {realm.factions.map(([name, color, value]) => (
              <div key={name}><span style={{ background: color }} /><strong>{name}</strong><small>{Math.round(value * 100)}%</small></div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="resource-grid">
        {resources.map((resource) => (
          <div key={resource}><span>{resource}</span><strong>{stock[resource] ?? 0}</strong></div>
        ))}
      </section>
      <section className="dashboard-preview">
        <h3>Village pulse</h3>
        <div><span>Population</span><strong>{status?.pop ?? 0}</strong></div>
        <div><span>Asleep now</span><strong>{status?.asleep ?? 0}</strong></div>
        <div><span>Daily rhythm</span><strong>{status?.routine ?? "Settling in"}</strong></div>
        <div><span>Mock decisions</span><strong>{simulation?.decisions.length ?? 0}</strong></div>
        <div><span>Construction</span><strong>{Math.round((simulation?.constructionProgress ?? 0) * 100)}%</strong></div>
        <div><span>State digest</span><strong className="state-digest">{simulation ? snapshotDigest(simulation) : "--------"}</strong></div>
      </section>
      {simulation?.trends.length ? (
        <section className="micro-chart" aria-label="Recent civilization trends">
          <h3>Recent pulse</h3>
          <div>{simulation.trends.slice(-18).map((point) => <i key={point.tick} style={{ height: `${Math.max(10, point.happiness * 100)}%` }} title={`Tick ${point.tick}: ${Math.round(point.happiness * 100)}% happiness`} />)}</div>
          <p>Average wellbeing across deterministic decision rounds.</p>
        </section>
      ) : null}
    </>
  );
}

function RelationshipsPanel() {
  const simulation = useAppStore((state) => state.simulation);
  const citizens = Object.values(simulation?.citizens ?? {}).sort((a, b) => a.id - b.id);
  const nodes = citizens.map((citizen, index) => {
    const angle = (index / Math.max(1, citizens.length)) * Math.PI * 2 - Math.PI / 2;
    return { citizen, x: 150 + Math.cos(angle) * 105, y: 130 + Math.sin(angle) * 92 };
  });
  const byId = new Map(nodes.map((node) => [node.citizen.id, node]));
  const edges = citizens.flatMap((citizen) => Object.entries(citizen.relationships).map(([targetId, trust]) => ({ from: citizen.id, to: Number(targetId), trust }))).filter((edge) => edge.from < edge.to && byId.has(edge.to));

  return (
    <>
      <PanelHeader title="Relationship map" detail="Trust changes only when simulated interactions occur." />
      <section className="relationship-map">
        <svg viewBox="0 0 300 260" role="img" aria-label={`${citizens.length} citizens and ${edges.length} recorded relationships`}>
          {edges.map((edge) => {
            const from = byId.get(edge.from)!;
            const to = byId.get(edge.to)!;
            return <line key={`${edge.from}-${edge.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={edge.trust >= 0.55 ? "#4f8e36" : "#c96b43"} strokeWidth={1 + edge.trust * 4} opacity={0.62} />;
          })}
          {nodes.map(({ citizen, x, y }) => <g key={citizen.id}><circle cx={x} cy={y} r="16" fill="#fbf6ec" stroke="#2f5f63" strokeWidth="3" /><text x={x} y={y + 3} textAnchor="middle">{citizen.name.slice(0, 2)}</text><text className="relationship-label" x={x} y={y + 29} textAnchor="middle">{citizen.name}</text></g>)}
        </svg>
        {!edges.length ? <p>Let the simulation run: social decisions will create the first trust links.</p> : null}
      </section>
      <div className="relationship-ledger">
        {edges.sort((a, b) => b.trust - a.trust).map((edge) => (
          <button key={`${edge.from}-${edge.to}`} onClick={() => selectCitizen(edge.from)}>
            <span><strong>{byId.get(edge.from)?.citizen.name}</strong><small>↔ {byId.get(edge.to)?.citizen.name}</small></span>
            <span><b style={{ width: `${Math.round(edge.trust * 100)}%` }} /></span>
            <em>{Math.round(edge.trust * 100)}</em>
          </button>
        ))}
      </div>
      <p className="panel-note">Line thickness reflects recorded trust. No relationship is generated solely for presentation.</p>
    </>
  );
}

function ChroniclePanel() {
  const status = useAppStore((state) => state.status);
  const renderer = useAppStore((state) => state.renderer);
  const scriptedEvents = window.LW.EVENTS ?? [];
  const simulation = useAppStore((state) => state.simulation);
  const liveSimulation = useAppStore((state) => state.liveSimulation);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const replayPlaying = useAppStore((state) => state.replayPlaying);
  const setReplayPlaying = useAppStore((state) => state.setReplayPlaying);
  const viewSimulationTick = useAppStore((state) => state.viewSimulationTick);
  const [filter, setFilter] = useState<"all" | "world" | "work" | "need" | "social" | "construction" | "economic" | "civic">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const mockEvents = (simulation?.events ?? []).filter((event) => filter === "all" || event.category === filter);
  const selectedEvent = simulation?.events.find((event) => event.id === selectedEventId);
  const selectedDecision = selectedEvent?.decisionId ? simulation?.decisions.find((decision) => decision.id === selectedEvent.decisionId) : null;
  return (
    <>
      <PanelHeader title="Village chronicle" detail="Structured moments from the world, newest first." />
      {liveSimulation && liveSimulation.tick > 0 ? (
        <section className="replay-scrubber">
          <div><h3>Replay timeline</h3><strong>{historicalTick === null ? `Live · T${liveSimulation.tick}` : `History · T${historicalTick}`}</strong></div>
          <input aria-label="Historical simulation tick" type="range" min="0" max={liveSimulation.tick} step="1" value={historicalTick ?? liveSimulation.tick} onChange={(event) => { setReplayPlaying(false); viewSimulationTick?.(Number(event.target.value)); }} />
          <div><small>T0</small><small>{liveSimulation.checkpoints.length} verified checkpoints</small><small>T{liveSimulation.tick}</small></div>
          <div className="replay-transport">
            <button onClick={() => { viewSimulationTick?.(0); setReplayPlaying(true); }}>↺ <span>From start</span></button>
            {historicalTick !== null ? <button className="replay-toggle" aria-label={replayPlaying ? "Pause replay" : "Play replay"} aria-pressed={replayPlaying} onClick={() => {
              if (!replayPlaying && historicalTick >= liveSimulation.tick) viewSimulationTick?.(0);
              setReplayPlaying(!replayPlaying);
            }}>{replayPlaying ? "Ⅱ" : "▶"} <span>{replayPlaying ? "Pause" : "Play"}</span></button> : null}
            {historicalTick !== null ? <button onClick={() => viewSimulationTick?.(null)}>Live world</button> : null}
          </div>
        </section>
      ) : null}
      {scriptedEvents.length ? (
        <div className="event-picker">
          {scriptedEvents.map(([id, label]) => <button key={id} className={status?.event === id ? "is-active" : ""} onClick={() => renderer?.startEvent(id)}>{label}</button>)}
        </div>
      ) : null}
      <div className="timeline-filters" aria-label="Timeline filters">
        {(["all", "world", "work", "need", "social", "construction", "economic", "civic"] as const).map((category) => <button key={category} className={filter === category ? "is-active" : ""} onClick={() => setFilter(category)}>{category}</button>)}
      </div>
      {selectedEvent ? (
        <section className="event-detail">
          <small>Day {selectedEvent.day} · tick {selectedEvent.tick} · {selectedEvent.category}</small>
          <h3>{selectedEvent.title}</h3>
          <p>{selectedEvent.detail}</p>
          {selectedDecision ? <div><span>Decision</span><strong>{selectedDecision.citizenName} chose “{selectedDecision.selectedLabel}”</strong></div> : null}
          <div className="event-people">{selectedEvent.citizenIds.map((id) => <button key={id} onClick={() => selectCitizen(id)}>{simulation?.citizens[id]?.name ?? `Citizen ${id}`}</button>)}</div>
        </section>
      ) : null}
      <ol className="chronicle-list">
        {mockEvents.slice(0, 24).map((entry) => (
          <li key={entry.id}><time>Day {entry.day} · T{entry.tick}</time><button className={selectedEventId === entry.id ? "is-active" : ""} onClick={() => setSelectedEventId(entry.id)}><strong>{entry.title}</strong> {entry.detail}</button></li>
        ))}
        {(status?.diary ?? []).map((entry) => (
          <li key={entry.id}><time>{entry.when}</time><p>{entry.text}</p></li>
        ))}
      </ol>
      {!status?.diary?.length ? <div className="empty-state">Let the clock run. The first moments of this world will appear here.</div> : null}
    </>
  );
}

function DecisionsPanel() {
  const selection = useAppStore((state) => state.status?.sel);
  const simulation = useAppStore((state) => state.simulation);
  const selectedCitizenId = useAppStore((state) => state.selectedCitizenId);
  const selectedId = selection?.type === "villager" ? selection.uid : selectedCitizenId;
  const citizen = selectedId != null ? simulation?.citizens[selectedId] : null;
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const decisionTrail = (simulation?.decisions ?? []).filter((item) => selectedId == null || item.citizenId === selectedId).slice(0, 6);
  const decision = decisionTrail.find((item) => item.id === selectedDecisionId) ?? decisionTrail[0] ?? simulation?.decisions[0];
  const request = decision ? simulation?.requests.find((item) => item.requestId === `request-${decision.freshness.requestedAtTick}-${decision.citizenId}`) : simulation?.requests.at(-1);
  const [primaryNeed, primaryNeedValue] = decision
    ? Object.entries(decision.context.needs).sort(([, left], [, right]) => right - left)[0] ?? ["need", 0]
    : ["need", 0];
  const resourceChanges = decision ? Object.entries(decision.resourceDelta).filter(([, amount]) => amount !== 0) : [];
  const targetCitizen = decision?.targetCitizenId != null ? simulation?.citizens[decision.targetCitizenId] : null;
  const validationLabel = decision?.resolution === "accepted" ? "The choice passed validation" : "The safe fallback took over";
  const actionLabel = decision?.actionStatus === "completed"
    ? `Completed at T${decision.completedAtTick ?? decision.tick}`
    : decision?.actionStatus === "cancelled"
      ? "Cancelled before the world changed"
      : `In progress across ${Math.max(1, decision?.route.length ?? 0)} route step${decision?.route.length === 1 ? "" : "s"}`;
  return (
    <>
      <PanelHeader title="Decision paths" detail="Follow how a villager moved from context and choices to a world change." />
      <div className="provider-badge"><span /> {decision ? `${decision.provider.label} · ${decision.resolution}` : request ? `${request.providerId} · ${request.status}` : "Provider waiting"}</div>
      {decision ? (
        <>
          <section className="decision-trail" aria-label="Recent decision history">
            <header><h3>How we got here</h3><small>Earlier decisions lead to now</small></header>
            <div>
              {[...decisionTrail].reverse().map((item, index, trail) => (
                <button
                  key={item.id}
                  className={item.id === decision.id ? "is-active" : ""}
                  onClick={() => setSelectedDecisionId(item.id)}
                  aria-label={`View ${item.citizenName}'s decision at tick ${item.tick}: ${item.selectedLabel}`}
                  aria-pressed={item.id === decision.id}
                >
                  <span>T{item.tick}</span>
                  <strong>{item.selectedLabel}</strong>
                  {index < trail.length - 1 ? <i aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </section>
          <section className="decision-map" aria-label="How this decision happened">
            <header className="decision-map-person">
              <PixelThumb asset="villager" scale={5} />
              <span><small>Decision at tick {decision.tick}</small><h3>{decision.citizenName}</h3><p>{decision.context.job} · {decision.context.traits.join(" + ")}</p></span>
            </header>
            <ol className="decision-spine">
              <li className="decision-step decision-step-perception">
                <span className="decision-knot" aria-hidden="true">1</span>
                <article>
                  <small>What mattered most</small>
                  <h3>{primaryNeed} was at {Math.round(primaryNeedValue * 100)}%</h3>
                  <div className="need-ribbon">
                    {Object.entries(decision.context.needs).map(([name, value]) => <span key={name} className={name === primaryNeed ? "is-primary" : ""}><b style={{ width: `${Math.round(value * 100)}%` }} /><small>{name} {Math.round(value * 100)}</small></span>)}
                  </div>
                </article>
              </li>
              <li className="decision-step decision-step-branches">
                <span className="decision-knot" aria-hidden="true">2</span>
                <article>
                  <small>Paths the world allowed</small>
                  <h3>{decision.candidates.filter((candidate) => candidate.legal).length} legal choices</h3>
                  <div className="decision-branches">
                    {decision.candidates.map((candidate) => (
                      <div key={candidate.id} className={candidate.id === (decision.selectedCandidateId ?? decision.selected) ? "is-chosen" : candidate.legal ? "is-open" : "is-blocked"}>
                        <span>{candidate.label}</span>
                        <strong>{candidate.id === (decision.selectedCandidateId ?? decision.selected) ? "chosen" : candidate.legal ? candidate.score?.toFixed(2) ?? "open" : "blocked"}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </li>
              <li className="decision-step decision-step-choice">
                <span className="decision-knot" aria-hidden="true">3</span>
                <article>
                  <small>The route taken</small>
                  <h3>{decision.selectedLabel}</h3>
                  <p>{decision.provider.label} selected this path{targetCitizen ? ` with ${targetCitizen.name}` : ""}.</p>
                </article>
              </li>
              <li className={`decision-step decision-step-validation ${decision.resolution === "fallback" ? "is-fallback" : ""}`}>
                <span className="decision-knot" aria-hidden="true">4</span>
                <article>
                  <small>Safety gate</small>
                  <h3>{validationLabel}</h3>
                  <p>{decision.resolutionReason ?? `State v${decision.stateVersion} stayed valid through deadline T${decision.freshness.deadlineTick}.`}</p>
                </article>
              </li>
              <li className="decision-step decision-step-outcome">
                <span className="decision-knot" aria-hidden="true">5</span>
                <article>
                  <small>What changed in the world</small>
                  <h3>{actionLabel}</h3>
                  {decision.consequences.map((item) => <p key={item}>{item}</p>)}
                  {resourceChanges.length ? <div className="resource-changes">{resourceChanges.map(([resource, amount]) => <span key={resource}>{resource} <strong>{amount > 0 ? "+" : ""}{amount}</strong></span>)}</div> : <p className="no-resource-change">No shared stock changed.</p>}
                </article>
              </li>
            </ol>
          </section>
          <details className="decision-evidence">
            <summary><span>Inspect the evidence</span><small>scores, freshness, and provider trace</small></summary>
            <div className="candidate-list">
              <h3>Legal candidates & provider signals</h3>
              <p className="decision-metadata">{decision.providerSignals?.kind === "heuristic" ? "Scores are heuristic contributions, not hidden reasoning." : "Signals are values returned in the provider envelope."}</p>
              {decision.providerSignals?.kind === "external" ? <p className="decision-metadata">{decision.providerSignals.responseModel ?? decision.provider.version}{decision.providerSignals.confidence !== undefined ? ` · ${Math.round(decision.providerSignals.confidence * 100)}% confidence` : ""}{decision.providerSignals.entropy !== undefined ? ` · entropy ${decision.providerSignals.entropy.toFixed(2)}` : ""}{decision.providerSignals.checkpointVersion ? ` · brain ${decision.providerSignals.checkpointVersion.slice(0, 10)}` : ""}{decision.providerSignals.inputTokens !== undefined ? ` · ${decision.providerSignals.inputTokens} input tokens` : ""}{decision.providerSignals.costUsd !== undefined ? ` · $${decision.providerSignals.costUsd.toFixed(6)}` : ""}</p> : null}
              {decision.candidates.map((candidate) => (
                <details key={candidate.id} className={candidate.id === (decision.selectedCandidateId ?? decision.selected) ? "is-selected" : candidate.legal ? "" : "is-blocked"}>
                  <summary><span>{candidate.label}<small>{candidate.legal ? candidate.trace.map((trace) => trace.rule).slice(0, 2).join(" · ") : candidate.blockedBy}</small></span><strong>{candidate.score != null ? candidate.score.toFixed(2) : "—"}</strong></summary>
                  <div>{candidate.trace.map((trace) => <p key={trace.rule}><span>{trace.rule}</span><strong>{trace.contribution >= 0 ? "+" : ""}{trace.contribution.toFixed(2)}</strong></p>)}</div>
                </details>
              ))}
              <p className="decision-metadata">Request {request?.status ?? decision.resolution} · world r{decision.freshness.worldRevision} · NPC r{decision.freshness.npcRevision} · topology r{decision.freshness.topologyRevision}{decision.latencyMs !== undefined ? ` · ${Math.round(decision.latencyMs)} ms` : ""}</p>
            </div>
          </details>
        </>
      ) : (
        <section className="decision-empty">
          <PixelThumb asset="icon_question" scale={6} />
          <h3>{citizen ? `${citizen.name}'s next choice` : "Waiting for the first decision"}</h3>
          <p>Run the simulation to produce an inspectable villager decision.</p>
        </section>
      )}
    </>
  );
}

function AssetsPanel() {
  const catalog = useAppStore((state) => state.catalog);
  const renderer = useAppStore((state) => state.renderer);
  const tool = useAppStore((state) => state.tool);
  const [filter, setFilter] = useState("");
  const [layers, setLayers] = useState({ terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } });
  const terrainBrush = useAppStore((state) => state.terrainBrush);
  const terrainFill = useAppStore((state) => state.terrainFill);
  const groups = useMemo(() => {
    const allowed = tool === "plant" ? ["nature", "landmark", "crop"] : tool === "people" ? ["character", "animal"] : ["building", "prop", "life", "event", "civic", "market"];
    return catalog.map((group) => ({ ...group, assets: group.assets.filter((asset) => allowed.includes(group.id) && asset.name.toLowerCase().includes(filter.toLowerCase())) })).filter((group) => group.assets.length);
  }, [catalog, filter, tool]);
  useEffect(() => {
    if (!renderer) return;
    const state = useAppStore.getState();
    const document = renderer.exportDocument({ presetId: state.presetId, seed: state.seed, era: state.era, chapter: state.chapter, government: state.government, societyGoal: state.societyGoal, goalPrompt: state.goalPrompt, decisionMode: state.decisionMode, brainDeployment: state.brainDeployment ?? undefined, weather: state.weather, simulation: state.liveSimulation });
    setLayers(structuredClone(document.editor.layers));
  }, [renderer]);
  const updateLayer = (layer: keyof typeof layers, field: "visible" | "locked") => {
    const value = !layers[layer][field];
    const applied = executeEditorCommand({ id: `layer-${layer}-${field}-${value}`, type: "set-layer", layer, [field]: value });
    setLayers(structuredClone(applied.document.editor.layers));
  };

  return (
    <>
      <PanelHeader title="Maker's shelf" detail="Everything here is drawn from the original pixel registry." />
      <section className="layer-controls">
        <h3>Editor layers</h3>
        {(Object.keys(layers) as Array<keyof typeof layers>).map((layer) => <div key={layer}><strong>{layer}</strong><button className={layers[layer].visible ? "is-active" : ""} onClick={() => updateLayer(layer, "visible")}>{layers[layer].visible ? "visible" : "hidden"}</button><button className={layers[layer].locked ? "is-locked" : ""} onClick={() => updateLayer(layer, "locked")}>{layers[layer].locked ? "locked" : "unlocked"}</button></div>)}
      </section>
      <input className="asset-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find an asset" />
      {tool === "terrain" ? (
        <>
          <section className="terrain-toolbox">
            <h3>Brush</h3>
            <div>{([1, 3, 5] as const).map((size) => <button key={size} className={!terrainFill && terrainBrush === size ? "is-active" : ""} onClick={() => applyTerrainBrush(size)}>{size} × {size}</button>)}<button className={terrainFill ? "is-active" : ""} onClick={() => applyTerrainFill(!terrainFill)}>Fill region</button></div>
            <p>Painting and fill operations are grouped into undoable editor transactions.</p>
          </section>
          <div className="asset-grid">
            {window.LW.Assets.TNAMES.map((name, index) => (
              <button key={name} onClick={() => selectTerrain(index)}>
                <img src={window.LW.Assets.swatch(index, 2)} alt="" /><span>{name}</span>
              </button>
            ))}
          </div>
        </>
      ) : groups.map((group) => (
        <section className="asset-group" key={group.id}>
          <h3>{group.label}<span>{group.assets.length}</span></h3>
          <div className="asset-grid">
            {group.assets.map((asset) => (
              <button key={asset.id} onClick={() => selectAsset(asset)} title={asset.desc ?? asset.name}>
                <img src={window.LW.Assets.thumb(asset.id, { v: 0 }, asset.foot[0] > 2 ? 1 : 2)} alt="" />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function PanelDock() {
  const panel = useAppStore((state) => state.panel);
  const panelOpen = useAppStore((state) => state.panelOpen);
  const mode = useAppStore((state) => state.mode);
  const closePanel = useAppStore((state) => state.closePanel);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [panel]);
  if (mode === "creator" || !panelOpen) return null;

  return (
    <aside ref={panelRef} className="panel-dock">
      <button className="panel-close" onClick={closePanel} aria-label="Close panel">×</button>
      {panel === "worlds" ? <WorldsPanel /> : null}
      {panel === "people" ? <PeoplePanel /> : null}
      {panel === "relationships" ? <RelationshipsPanel /> : null}
      {panel === "civilization" ? <CivilizationPanel /> : null}
      {panel === "chronicle" ? <ChroniclePanel /> : null}
      {panel === "decisions" ? <DecisionsPanel /> : null}
      {panel === "experiments" ? <ExperimentsPanel /> : null}
      {panel === "assets" ? <AssetsPanel /> : null}
      {panel !== "people" && panel !== "decisions" ? <SelectionCard /> : null}
    </aside>
  );
}
