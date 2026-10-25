import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DecisionRecord } from "../../sim/types";
import type { ExperimentObservatoryPayload, ObservatoryCitizen, ObservatoryEpisode } from "../../experiments/observatoryTypes";
import type { LearningExperimentState } from "../../experiments/types";
import "./observatory.css";
import { simulationDay } from "../../sim/time";

const BIOME_COLORS: Record<string, string> = {
  ocean: "#6e9ca0",
  shore: "#cbbd91",
  grassland: "#9cab74",
  forest: "#637d56",
  wetland: "#718c72",
  highland: "#8a8972",
};

const GROUP_COLORS = ["#b8613b", "#426f77", "#79608c", "#9a7a35", "#4f7650", "#a24f55"];

function words(value?: string) {
  return (value ?? "unknown").replaceAll("_", " ").replaceAll("-", " ");
}

function actionColor(action?: string) {
  if (!action) return "#e8e0cb";
  if (/water|drink|fish/.test(action)) return "#5da1b1";
  if (/food|eat|forage|hunt|crop|cook/.test(action)) return "#6f9455";
  if (/build|construct|material|wood|stone|clay|fiber|craft|repair/.test(action)) return "#bd7548";
  if (/group|share|teach|help|social|rescue|promise|forgive/.test(action)) return "#8a6ba0";
  if (/rest|idle|home/.test(action)) return "#d7c58f";
  return "#d9ded1";
}

function layout(canvas: HTMLCanvasElement, episode: ObservatoryEpisode) {
  const rect = canvas.getBoundingClientRect();
  const padding = 18;
  const scale = Math.min((rect.width - padding * 2) / episode.snapshot.width, (rect.height - padding * 2) / episode.snapshot.height);
  return {
    width: rect.width,
    height: rect.height,
    scale,
    x: (rect.width - episode.snapshot.width * scale) / 2,
    y: (rect.height - episode.snapshot.height * scale) / 2,
  };
}

function IslandField({ episode, selectedCitizenId, onSelect }: { episode: ObservatoryEpisode; selectedCitizenId?: number; onSelect: (id: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const frame = layout(canvas, episode);
      context.fillStyle = "#173f3a";
      context.fillRect(0, 0, frame.width, frame.height);
      for (let index = 0; index < episode.snapshot.width * episode.snapshot.height; index += 1) {
        const x = index % episode.snapshot.width;
        const y = Math.floor(index / episode.snapshot.width);
        const biome = episode.snapshot.biomes[index] ?? (episode.snapshot.walkable[index] ? "grassland" : "ocean");
        context.fillStyle = BIOME_COLORS[biome] ?? "#91a375";
        context.fillRect(frame.x + x * frame.scale, frame.y + y * frame.scale, Math.ceil(frame.scale + 0.2), Math.ceil(frame.scale + 0.2));
        const hazard = episode.snapshot.hazards[index] ?? 0;
        if (hazard > 0.62) {
          context.fillStyle = `rgba(111,47,42,${Math.min(0.28, (hazard - 0.6) * 0.7)})`;
          context.fillRect(frame.x + x * frame.scale, frame.y + y * frame.scale, frame.scale, frame.scale);
        }
      }

      const point = (position: { x: number; y: number }) => ({ x: frame.x + (position.x + 0.5) * frame.scale, y: frame.y + (position.y + 0.5) * frame.scale });
      for (const resource of episode.snapshot.resources) {
        if (resource.status === "depleted") continue;
        const p = point(resource.position);
        context.fillStyle = resource.kind === "tree" ? "#294f36" : resource.kind === "wild-food" ? "#c18555" : resource.kind === "stone" ? "#666d67" : resource.kind === "fiber" ? "#b7a85d" : "#80955e";
        context.fillRect(p.x - Math.max(1, frame.scale * 0.24), p.y - Math.max(1, frame.scale * 0.24), Math.max(2, frame.scale * 0.48), Math.max(2, frame.scale * 0.48));
      }
      for (const building of episode.snapshot.buildings) {
        const p = point(building.position);
        context.fillStyle = "#533f31";
        context.fillRect(p.x - frame.scale * 0.44, p.y - frame.scale * 0.44, frame.scale * 0.88, frame.scale * 0.88);
      }
      for (const project of episode.snapshot.projects) {
        if (project.status === "cancelled") continue;
        const p = point(project.position);
        context.strokeStyle = project.status === "complete" ? "#d9c57b" : "#e5a85e";
        context.lineWidth = Math.max(1.5, frame.scale * 0.18);
        context.strokeRect(p.x - frame.scale * 0.5, p.y - frame.scale * 0.5, frame.scale, frame.scale);
      }

      for (const action of episode.snapshot.actions) {
        if (action.route.length < 2) continue;
        context.beginPath();
        action.route.slice(action.routeIndex).forEach((step, index) => {
          const p = point(step);
          if (!index) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
        });
        context.strokeStyle = actionColor(action.actionId);
        context.globalAlpha = action.citizenId === selectedCitizenId ? 0.95 : 0.32;
        context.lineWidth = action.citizenId === selectedCitizenId ? 2.2 : 1;
        context.stroke();
        context.globalAlpha = 1;
      }

      const groupForCitizen = new Map<number, number>();
      episode.snapshot.groups.forEach((group, index) => group.memberIds.forEach((id) => groupForCitizen.set(id, index)));
      for (const citizen of episode.snapshot.citizens) {
        const p = point(citizen.position);
        const alive = citizen.physical?.alive !== false;
        const groupIndex = groupForCitizen.get(citizen.id);
        if (groupIndex !== undefined) {
          context.beginPath();
          context.arc(p.x, p.y, Math.max(5, frame.scale * 0.55), 0, Math.PI * 2);
          context.strokeStyle = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
          context.globalAlpha = 0.72;
          context.lineWidth = 2;
          context.stroke();
          context.globalAlpha = 1;
        }
        context.beginPath();
        context.arc(p.x, p.y, Math.max(3.3, frame.scale * 0.34), 0, Math.PI * 2);
        const decision = episode.snapshot.decisions.find((item) => item.citizenId === citizen.id);
        context.fillStyle = alive ? actionColor(decision?.selected) : "#493e3a";
        context.fill();
        context.strokeStyle = citizen.id === selectedCitizenId ? "#fff9dc" : "rgba(30,37,34,.7)";
        context.lineWidth = citizen.id === selectedCitizenId ? 3 : 1;
        context.stroke();
        if (citizen.id === selectedCitizenId) {
          context.fillStyle = "#fff9dc";
          context.font = "700 11px ui-rounded, system-ui, sans-serif";
          context.textAlign = "center";
          context.fillText(citizen.name, p.x, p.y - Math.max(9, frame.scale * 0.7));
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [episode, selectedCitizenId]);

  const selectAt = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = layout(canvas, episode);
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - frame.x) / frame.scale;
    const y = (event.clientY - rect.top - frame.y) / frame.scale;
    const nearest = episode.snapshot.citizens.map((citizen) => ({ citizen, distance: Math.hypot(citizen.position.x + 0.5 - x, citizen.position.y + 0.5 - y) })).sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance <= Math.max(1.5, 10 / frame.scale)) onSelect(nearest.citizen.id);
  };

  return <canvas ref={canvasRef} className="observatory-field" onClick={selectAt} aria-label="Live training island. Click a citizen to inspect its brain." />;
}

function Need({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const safe = Math.max(0, Math.min(1, inverse ? 1 - value : value));
  return <div className="observatory-need"><span>{label}</span><i><b style={{ width: `${safe * 100}%` }} /></i><strong>{Math.round(safe * 100)}</strong></div>;
}

function BrainInspector({ citizen, decision, episode }: { citizen?: ObservatoryCitizen; decision?: DecisionRecord; episode: ObservatoryEpisode }) {
  if (!citizen) return <aside className="observatory-inspector is-empty"><p>Select a person on the island.</p></aside>;
  const action = episode.snapshot.actions.find((item) => item.citizenId === citizen.id);
  const evaluations = [...(decision?.providerSignals?.evaluations ?? [])].sort((left, right) => (right.probability ?? -Infinity) - (left.probability ?? -Infinity)).slice(0, 6);
  const brain = decision?.providerSignals?.kind === "external" ? decision.providerSignals.responseModel?.replace(/^local:/, "") : undefined;
  const groups = episode.snapshot.groups.filter((group) => group.memberIds.includes(citizen.id));
  return (
    <aside className="observatory-inspector">
      <header>
        <span className={`observatory-life ${citizen.physical?.alive === false ? "is-dead" : ""}`} />
        <div><h2>{citizen.name}</h2><p>{citizen.physical?.alive === false ? "Died in this episode" : citizen.currentActivity}</p></div>
        <strong>#{citizen.id}</strong>
      </header>
      <section className="observatory-brain-id"><span>Brain</span><code title={brain}>{brain ? brain.replace(/^.*-(g\d+-brain-)/, "$1") : "waiting for first decision"}</code><small>{decision ? `${decision.provider.label} · tick ${decision.tick}` : "No decision recorded yet"}</small></section>
      <section className="observatory-needs">
        <Need label="Health" value={citizen.physical?.health ?? 0} />
        <Need label="Hunger" value={citizen.needs.hunger} inverse />
        <Need label="Thirst" value={citizen.needs.thirst ?? 0} inverse />
        <Need label="Energy" value={citizen.needs.fatigue} inverse />
      </section>
      <section className="observatory-current-action">
        <span>Now</span><strong>{words(action?.actionId ?? decision?.selected ?? citizen.currentActionId)}</strong>
        <p>{action ? `${action.phase} · ${action.route.length - action.routeIndex} route steps left · ${action.workTicksRemaining} work ticks` : decision?.selectedLabel ?? "Waiting for an objective"}</p>
      </section>
      <section className="observatory-considering">
        <header><h3>What the brain considered</h3>{decision?.providerSignals?.kind === "external" ? <span>{Math.round((decision.providerSignals.confidence ?? 0) * 100)}% chosen</span> : null}</header>
        {evaluations.length ? evaluations.map((evaluation) => {
          const candidate = decision?.candidates.find((item) => item.id === evaluation.candidateId);
          const probability = evaluation.probability ?? 0;
          const selected = evaluation.candidateId === decision?.selectedCandidateId;
          return <div className={selected ? "is-selected" : ""} key={evaluation.candidateId}><span>{candidate?.label ?? words(evaluation.candidateId)}</span><i><b style={{ width: `${probability * 100}%` }} /></i><strong>{evaluation.probability === undefined ? evaluation.score?.toFixed(2) ?? "—" : `${Math.round(probability * 100)}%`}</strong></div>;
        }) : <p className="observatory-empty-copy">The first neural choice has not arrived.</p>}
      </section>
      <section className="observatory-facts">
        <div><span>Inventory</span><strong>{Object.entries(citizen.inventory).filter(([, amount]) => amount > 0).map(([item, amount]) => `${words(item)} ${amount}`).join(", ") || "empty"}</strong></div>
        <div><span>Knowledge</span><strong>{citizen.knowledge.discoveredTiles} tiles · {citizen.knowledge.knownResources} resources</strong></div>
        <div><span>Groups</span><strong>{groups.map((group) => group.name).join(", ") || "unaffiliated"}</strong></div>
        <div><span>Traits</span><strong>{citizen.traits.join(", ") || "unexpressed"}</strong></div>
      </section>
      <section className="observatory-memories"><h3>Recent memories</h3>{citizen.memories.length ? [...citizen.memories].reverse().map((memory) => <p data-tone={memory.tone} key={memory.id}>{memory.text}</p>) : <p>No durable memory yet.</p>}</section>
    </aside>
  );
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? `Observatory returned ${response.status}.`);
  return payload;
}

const REPLAY_TICKS_PER_FRAME = 4;

export function EvolutionObservatory() {
  const initialId = new URLSearchParams(window.location.search).get("experiment");
  const [experimentId, setExperimentId] = useState(initialId);
  const [payload, setPayload] = useState<ExperimentObservatoryPayload | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [citizenId, setCitizenId] = useState<number>();
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [replayTick, setReplayTick] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);

  useEffect(() => {
    if (experimentId) return;
    void request<{ experiments: LearningExperimentState[] }>("/api/experiments").then(({ experiments }) => {
      const experiment = experiments.find((item) => item.status === "running") ?? experiments[0];
      if (!experiment) throw new Error("No evolution experiment exists yet.");
      setExperimentId(experiment.id);
      const url = new URL(window.location.href);
      url.searchParams.set("experiment", experiment.id);
      window.history.replaceState(null, "", url);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not find an experiment."));
  }, [experimentId]);

  useEffect(() => {
    if (!experimentId || paused || replayTick !== null) return;
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await request<ExperimentObservatoryPayload>(`/api/experiments/${experimentId}/observatory`);
        if (stopped) return;
        setPayload(next);
        setError("");
        setEpisodeId((current) => next.episodes.some((item) => item.episodeId === current) ? current : next.episodes[0]?.episodeId ?? null);
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Live state is unavailable.");
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 800);
      }
    };
    void poll();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [experimentId, paused, replayTick]);

  const episode = payload?.episodes.find((item) => item.episodeId === episodeId) ?? payload?.episodes[0];
  useEffect(() => {
    if (!experimentId || !episodeId || replayTick === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ episode: episodeId, tick: String(replayTick) });
      void request<ExperimentObservatoryPayload>(`/api/experiments/${experimentId}/observatory?${query}`, controller.signal).then((next) => {
        setPayload(next);
        setError("");
      }).catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Replay frame is unavailable.");
      });
    }, 55);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [experimentId, episodeId, replayTick]);

  useEffect(() => {
    if (!replayPlaying || replayTick === null || !episode) return;
    if (episode.replay.displayTick !== replayTick) return;
    if (replayTick >= episode.replay.maximumTick) {
      setReplayPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setReplayTick((current) => current === null ? null : Math.min(episode.replay.maximumTick, current + replaySpeed * REPLAY_TICKS_PER_FRAME)), 120);
    return () => window.clearTimeout(timer);
  }, [episode?.replay.displayTick, episode?.replay.maximumTick, replayPlaying, replaySpeed, replayTick]);

  const leaveReplay = () => {
    setReplayPlaying(false);
    setReplayTick(null);
    setPaused(false);
  };

  const toggleReplay = () => {
    if (!episode) return;
    if (replayTick === null || replayTick >= episode.replay.maximumTick) {
      setPaused(true);
      setReplayTick(episode.replay.minimumTick);
      setReplayPlaying(true);
      return;
    }
    setReplayPlaying((value) => !value);
  };

  useEffect(() => {
    if (!episode) return;
    setCitizenId((current) => episode.snapshot.citizens.some((citizen) => citizen.id === current) ? current : episode.snapshot.citizens.find((citizen) => citizen.physical?.alive !== false)?.id ?? episode.snapshot.citizens[0]?.id);
  }, [episode?.episodeId]);
  const citizen = episode?.snapshot.citizens.find((item) => item.id === citizenId);
  const decision = episode?.snapshot.decisions.find((item) => item.citizenId === citizenId);
  const relevantEvents = useMemo(() => episode ? [...episode.snapshot.events].reverse().filter((event) => !citizenId || !event.citizenIds.length || event.citizenIds.includes(citizenId)).slice(0, 18) : [], [episode, citizenId]);

  return (
    <main className="observatory-shell">
      <header className="observatory-topbar">
        <a href="/" className="observatory-brand"><span className="observatory-mark"><i /><i /><i /></span><span><strong>Freewill Observatory</strong><small>Live evolutionary field notes</small></span></a>
        <div className="observatory-run-title"><span className={payload?.experiment.status === "running" ? "is-live" : ""}>{payload?.experiment.status ?? "connecting"}</span><h1>{payload?.experiment.name ?? "Finding experiment"}</h1></div>
        {payload ? <div className="observatory-run-progress"><strong>{payload.experiment.progress.completedEpisodes}/{payload.experiment.progress.totalEpisodes}</strong><span>episodes</span><i><b style={{ width: `${payload.experiment.progress.completedEpisodes / Math.max(1, payload.experiment.progress.totalEpisodes) * 100}%` }} /></i></div> : null}
        <button className="observatory-pause" onClick={() => replayTick !== null ? leaveReplay() : setPaused((value) => !value)}>{replayTick !== null ? (episode?.live ? "Return to live" : "Return to end") : paused ? "Resume live view" : "Pause view"}</button>
      </header>

      {error ? <div className="observatory-error" role="alert"><strong>Live view unavailable</strong><span>{error}</span></div> : null}
      {payload && !payload.episodes.length ? <div className="observatory-empty"><strong>No island is active right now.</strong><span>The latest completed island will appear when its saved snapshot is available.</span></div> : null}
      {episode ? <>
        <nav className="observatory-episodes" aria-label="Active training islands">
          {payload?.episodes.map((item, index) => <button className={item.episodeId === episode.episodeId ? "is-active" : ""} key={item.episodeId} onClick={() => setEpisodeId(item.episodeId)}><span>Island {index + 1}</span><strong>Day {item.day}/{item.maximumDays}</strong><small>{words(item.cohort)} · seed {item.seed} · {item.survivors} alive</small></button>)}
        </nav>
        <section className="observatory-workbench">
          <div className="observatory-map-panel">
            <div className="observatory-map-caption"><span>{episode.live ? "Receiving live state" : "Completed episode"}</span><strong>Generation {episode.generation + 1} · replicate {episode.replicate + 1}</strong><small>Tick {episode.snapshot.tick} · sampled {payload ? new Date(payload.sampledAt).toLocaleTimeString() : ""}</small></div>
            <div className={`observatory-replay ${replayTick !== null ? "is-replaying" : ""}`}>
              <button type="button" className="observatory-replay-play" onClick={toggleReplay} aria-label={replayPlaying ? "Pause replay" : replayTick === null ? "Replay episode" : "Play replay"}>{replayPlaying ? "❚❚" : "▶"}<span>{replayPlaying ? "Pause" : replayTick === null ? "Replay" : "Play"}</span></button>
              <button type="button" className="observatory-replay-step" disabled={replayTick === null || episode.replay.displayTick <= episode.replay.minimumTick} onClick={() => { setReplayPlaying(false); setReplayTick(Math.max(episode.replay.minimumTick, episode.replay.displayTick - 1)); }} aria-label="Previous simulation tick">−</button>
              <div className="observatory-replay-time"><strong>Day {simulationDay(episode.replay.displayTick)}</strong><small>tick {episode.replay.displayTick} of {episode.replay.maximumTick}</small></div>
              <div className="observatory-replay-track">
                <input aria-label="Replay timeline" type="range" min={episode.replay.minimumTick} max={episode.replay.maximumTick} value={replayTick ?? episode.replay.displayTick} onChange={(event) => { setPaused(true); setReplayPlaying(false); setReplayTick(Number(event.target.value)); }} />
                <div aria-hidden="true">{episode.replay.checkpointTicks.map((tick) => <i key={tick} style={{ left: `${(tick - episode.replay.minimumTick) / Math.max(1, episode.replay.maximumTick - episode.replay.minimumTick) * 100}%` }} />)}</div>
              </div>
              <button type="button" className="observatory-replay-step" disabled={replayTick === null || episode.replay.displayTick >= episode.replay.maximumTick} onClick={() => { setReplayPlaying(false); setReplayTick(Math.min(episode.replay.maximumTick, episode.replay.displayTick + 1)); }} aria-label="Next simulation tick">+</button>
              <button type="button" className="observatory-replay-speed" onClick={() => setReplaySpeed((speed) => speed === 1 ? 2 : speed === 2 ? 4 : 1)} aria-label={`Replay speed ${replaySpeed} times. Click to change.`}>{replaySpeed}×</button>
            </div>
            <IslandField episode={episode} selectedCitizenId={citizenId} onSelect={setCitizenId} />
            <div className="observatory-roster" aria-label="Citizen roster">{episode.snapshot.citizens.map((item) => {
              const latest = episode.snapshot.decisions.find((value) => value.citizenId === item.id);
              return <button key={item.id} className={item.id === citizenId ? "is-active" : ""} data-alive={item.physical?.alive !== false} onClick={() => setCitizenId(item.id)}><span>{item.name.slice(0, 1)}</span><strong>{item.name}</strong><small>{item.physical?.alive === false ? "dead" : words(latest?.selected ?? item.currentActionId ?? "waiting")}</small></button>;
            })}</div>
          </div>
          <BrainInspector citizen={citizen} decision={decision} episode={episode} />
        </section>
        <section className="observatory-log">
          <header><div><h2>Field log</h2><p>{citizen ? `Events touching ${citizen.name}, plus world events.` : "Latest island events."}</p></div><div className="observatory-legend"><span data-kind="water">water</span><span data-kind="food">food</span><span data-kind="work">work</span><span data-kind="social">social</span><span data-kind="danger">danger</span></div></header>
          <div>{relevantEvents.length ? relevantEvents.map((event) => <article data-category={event.category} key={event.id}><time>Day {event.day}<small>tick {event.tick}</small></time><span><strong>{event.title}</strong><p>{event.detail}</p></span></article>) : <p className="observatory-empty-copy">No matching events have been recorded yet.</p>}</div>
        </section>
      </> : null}
    </main>
  );
}
