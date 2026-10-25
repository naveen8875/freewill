import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrainGenerationSummary, LearningExperimentState } from "../../experiments/types";
import { useAppStore } from "../../state/appStore";

const FITNESS_LABELS = ["survival", "body stability", "competence", "adaptability", "value alignment", "efficiency", "novelty"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? `Experiment API returned ${response.status}.`);
  return payload;
}

function parseSeeds(value: string) {
  return [...new Set(value.split(/[,\s]+/).map(Number).filter((seed) => Number.isInteger(seed) && seed >= 0))];
}

function Metric({ label, value }: { label: string; value: number }) {
  return <span className="experiment-metric"><small>{label}</small><strong>{Math.round(value * 100)}%</strong></span>;
}

function CountMetric({ label, value }: { label: string; value: number }) {
  return <span className="experiment-metric"><small>{label}</small><strong>{Number.isInteger(value) ? value : value.toFixed(1)}</strong></span>;
}

function TopologyPreview({ topology }: { topology: { nodes: number; maximumNodes?: number; connections: number; maximumConnections?: number; recurrentConnections?: number; genomeVersion?: string } }) {
  const maximumNodes = topology.maximumNodes ?? 48;
  const density = topology.maximumConnections ? topology.connections / topology.maximumConnections : 0;
  return (
    <div className="topology-preview" aria-label="Evolved brain topology summary">
      <div><small>384 observations</small><span className="topology-inputs" /></div>
      <div className="topology-node-grid">{Array.from({ length: maximumNodes }, (_, index) => <i key={index} className={index < topology.nodes ? "is-active" : ""} />)}</div>
      <div><span className="topology-outputs" /><small>40 action families</small></div>
      <p>{topology.nodes}/{maximumNodes} active nodes · {topology.connections.toLocaleString()} connections · {topology.recurrentConnections ?? 0} recurrent · {(density * 100).toFixed(1)}% density</p>
    </div>
  );
}

export function ExperimentsPanel() {
  const [experiments, setExperiments] = useState<LearningExperimentState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LearningExperimentState | null>(null);
  const [error, setError] = useState("");
  const [lineage, setLineage] = useState<{ nodes: Array<{ brainId: string; generation: number; artifactHash: string | null; kind: string; speciesId?: string; mutations?: Array<{ kind: string; count: number }>; topology?: { nodes: number; maximumNodes?: number; connections: number; maximumConnections?: number; recurrentConnections?: number; genomeVersion?: string }; parentIds?: string[] }>; edges: Array<{ parentId: string; childId: string; kind: string; magnitude: number }> }>({ nodes: [], edges: [] });
  const [inspectedBrainId, setInspectedBrainId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ name: "Island evolution 01", population: 20, days: 30, generations: 3, replicates: 2, trainingSeeds: "2610, 4217, 8031, 9901", heldOutSeeds: "13337, 44021", harshness: "balanced", profile: "balanced" });
  const setBrainDeployment = useAppStore((state) => state.setBrainDeployment);
  const setDecisionMode = useAppStore((state) => state.setDecisionMode);
  const setCivilizationStarted = useAppStore((state) => state.setCivilizationStarted);
  const setSpeed = useAppStore((state) => state.setSpeed);
  const bumpWorldRevision = useAppStore((state) => state.bumpWorldRevision);
  const closePanel = useAppStore((state) => state.closePanel);
  const worldPopulation = useAppStore((state) => state.status?.pop ?? 0);

  const refresh = useCallback(async () => {
    try {
      const list = await api<{ experiments: LearningExperimentState[] }>("/api/experiments");
      setExperiments(list.experiments);
      const id = selectedId ?? list.experiments[0]?.id;
      if (id) {
        setSelectedId(id);
        const [detail, tree] = await Promise.all([
          api<{ experiment: LearningExperimentState }>(`/api/experiments/${id}`),
          api<{ lineage: typeof lineage }>(`/api/experiments/${id}/lineage`),
        ]);
        setSelected(detail.experiment);
        setLineage(tree.lineage);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load experiments.");
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), selected?.status === "running" || selected?.status === "queued" ? 1_500 : 5_000);
    return () => window.clearInterval(interval);
  }, [refresh, selected?.status]);

  const start = async () => {
    setStarting(true);
    try {
      const payload = await api<{ experiment: LearningExperimentState }>("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, trainingSeeds: parseSeeds(form.trainingSeeds), heldOutSeeds: parseSeeds(form.heldOutSeeds), width: 64, height: 48 }),
      });
      setSelectedId(payload.experiment.id);
      setSelected(payload.experiment);
      setError("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start experiment.");
    } finally {
      setStarting(false);
    }
  };

  const comparison = useMemo(() => {
    if (!selected) return [];
    const groups = new Map<string, typeof selected.evaluations>();
    for (const episode of selected.evaluations) groups.set(episode.cohort, [...(groups.get(episode.cohort) ?? []), episode]);
    const average = (episodes: typeof selected.evaluations, value: (episode: typeof episodes[number]) => number) => episodes.reduce((sum, episode) => sum + value(episode), 0) / episodes.length;
    return [...groups.entries()].map(([cohort, episodes]) => ({
      cohort,
      survival: average(episodes, (episode) => episode.metrics.survivors / selected.config.population),
      stability: average(episodes, (episode) => 1 - episode.metrics.criticalNeedFraction),
      success: average(episodes, (episode) => episode.metrics.successfulActionFraction),
      unreachable: average(episodes, (episode) => episode.metrics.unreachableActionFraction ?? 0),
      collapses: average(episodes, (episode) => episode.metrics.collapsesPerHundredPersonDays ?? 0),
      foodBalance: average(episodes, (episode) => (episode.metrics.renewableFoodProduced ?? 0) - (episode.metrics.spoiledFood ?? 0)),
    }));
  }, [selected]);

  const verdict = useMemo(() => {
    if (!selected || selected.status !== "completed") return null;
    const cohort = (name: string) => selected.evaluations.filter((episode) => episode.cohort === name);
    const evolved = cohort("evolved-evaluation");
    const unevolved = cohort("unevolved-control");
    if (!evolved.length || !unevolved.length) return { tone: "inconclusive", title: "Evolution not yet proven", detail: "The held-out comparison is incomplete." };
    const average = (episodes: typeof evolved, value: (episode: typeof evolved[number]) => number) => episodes.reduce((sum, episode) => sum + value(episode), 0) / episodes.length;
    const survivalDelta = average(evolved, (episode) => episode.metrics.survivors / selected.config.population) - average(unevolved, (episode) => episode.metrics.survivors / selected.config.population);
    const stabilityDelta = average(evolved, (episode) => 1 - episode.metrics.criticalNeedFraction) - average(unevolved, (episode) => 1 - episode.metrics.criticalNeedFraction);
    const unreachableRate = average(evolved, (episode) => episode.metrics.unreachableActionFraction ?? 1);
    const enoughEvidence = selected.config.heldOutSeeds.length >= 2 && selected.config.replicates >= 2;
    const integrityPass = unreachableRate < 0.01;
    const improved = enoughEvidence && integrityPass && survivalDelta > 0.02 && stabilityDelta >= 0;
    const regressed = survivalDelta < -0.02 || stabilityDelta < -0.08;
    return improved
      ? { tone: "improved", title: "Held-out improvement detected", detail: `Evolved survival changed by ${Math.round(survivalDelta * 100)} points and physical stability by ${Math.round(stabilityDelta * 100)} points across unseen islands.` }
      : regressed
        ? { tone: "regressed", title: "This generation regressed", detail: `Held-out survival changed by ${Math.round(survivalDelta * 100)} points and physical stability by ${Math.round(stabilityDelta * 100)} points. Keep the lineage, but do not call it successful.` }
        : { tone: "inconclusive", title: "Evolution not yet proven", detail: `${!integrityPass ? `The environment still produced ${Math.round(unreachableRate * 100)}% unreachable accepted actions, so this comparison is not scientifically clean.` : enoughEvidence ? "The evolved brains did not beat their unevolved baseline consistently." : "Run at least 2 held-out seeds with 2 replicates before claiming improvement."} Current survival change: ${Math.round(survivalDelta * 100)} points; stability change: ${Math.round(stabilityDelta * 100)} points.` };
  }, [selected]);

  const deployGeneration = (generation: BrainGenerationSummary) => {
    if (!selected || !generation?.brainIds.length) return;
    const speciesByBrain = new Map(generation.species?.flatMap((species) => species.memberIds.map((brainId) => [brainId, species.speciesId] as const)) ?? []);
    setBrainDeployment({
      experimentId: selected.id,
      generation: generation.generation,
      label: `${selected.name} · generation ${generation.generation}`,
      brainIds: generation.brainIds,
      speciesIds: generation.brainIds.map((brainId) => speciesByBrain.get(brainId) ?? "unclassified"),
    });
    setDecisionMode("local-brain");
    setCivilizationStarted(false);
    setSpeed(0);
    useAppStore.getState().renderer?.setSpeed(0);
    bumpWorldRevision();
    closePanel();
  };
  const inspectedBrain = lineage.nodes.find((node) => node.brainId === inspectedBrainId) ?? lineage.nodes.find((node) => node.topology);
  const activeExperiment = experiments.find((experiment) => experiment.status === "running" || experiment.status === "queued");

  return (
    <div className="experiments-panel">
      <div className="panel-heading"><div><h2>Evolution laboratory</h2><p>Train small local brains across repeatable islands, then test them on worlds selection never saw.</p></div></div>
      <section className="experiment-create">
        <div className="experiment-form-grid">
          <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><span>Population</span><input type="number" min="4" max="100" value={form.population} onChange={(event) => setForm({ ...form, population: Number(event.target.value) })} /></label>
          <label><span>Days per island</span><input type="number" min="1" max="100" value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) })} /></label>
          <label><span>Generations</span><input type="number" min="1" max="50" value={form.generations} onChange={(event) => setForm({ ...form, generations: Number(event.target.value) })} /></label>
          <label><span>Replicates / seed</span><input type="number" min="1" max="10" value={form.replicates} onChange={(event) => setForm({ ...form, replicates: Number(event.target.value) })} /></label>
          <label className="wide"><span>Training seeds</span><input value={form.trainingSeeds} onChange={(event) => setForm({ ...form, trainingSeeds: event.target.value })} /></label>
          <label className="wide"><span>Held-out seeds</span><input value={form.heldOutSeeds} onChange={(event) => setForm({ ...form, heldOutSeeds: event.target.value })} /></label>
          <label><span>Island</span><select value={form.harshness} onChange={(event) => setForm({ ...form, harshness: event.target.value })}><option value="gentle">Gentle</option><option value="balanced">Balanced</option><option value="harsh">Harsh</option></select></label>
          <label><span>Compute profile</span><select value={form.profile} onChange={(event) => setForm({ ...form, profile: event.target.value })}><option value="eco">Eco · one world</option><option value="balanced">Balanced · two worlds</option><option value="demo">Demo · one observable world</option></select></label>
        </div>
        <p className="experiment-note">Civilization is not rewarded. Brains are selected across survival, physical stability, competence, adaptability, personal-value alignment, efficiency and novelty.</p>
        <button className="primary-action" disabled={starting || Boolean(activeExperiment)} onClick={() => void start()}>{starting ? "Starting…" : activeExperiment ? "Experiment already running" : "Start local experiment"}</button>
      </section>

      {error ? <p className="experiment-error" role="alert">{error}</p> : null}
      {experiments.length ? <label className="experiment-picker"><span>Saved experiments</span><select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name} · {experiment.status}</option>)}</select></label> : null}

      {selected ? (
        <>
          <section className="experiment-progress">
            <header><div><small>{selected.status}</small><h3>{selected.name}</h3></div><strong>G{selected.progress.generation + 1}/{selected.progress.totalGenerations}</strong></header>
            <progress max={Math.max(1, selected.progress.totalEpisodes)} value={selected.progress.completedEpisodes} />
            <p>{selected.progress.message}{selected.progress.currentDay !== undefined ? ` · day ${selected.progress.currentDay}/${selected.progress.maximumDay}` : ""}{selected.progress.survivors !== undefined ? ` · ${selected.progress.survivors} alive` : ""}</p>
            <small>{selected.progress.completedEpisodes}/{selected.progress.totalEpisodes} episodes complete</small>
            <a className="experiment-export" href={`/observatory?experiment=${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer">Open evolution observatory</a>
            {selected.status === "completed" ? <a className="experiment-export" href={`/api/experiments/${selected.id}/export`} download>Export experiment bundle</a> : null}
            {selected.status === "completed" && selected.generations.length ? <button className="primary-action" onClick={() => deployGeneration(selected.generations.at(-1)!)}>Deploy latest brains to this island</button> : null}
            {selected.status === "completed" && selected.generations.length && worldPopulation !== selected.config.population ? <small>This world has {worldPopulation} villagers; the first {Math.min(worldPopulation, selected.config.population)} receive evolved brains and any extras receive new local brains.</small> : null}
            {selected.status === "running" || selected.status === "queued" ? <button className="danger-action" onClick={() => void api(`/api/experiments/${selected.id}/cancel`, { method: "POST" }).then(refresh).catch((cause) => setError(String(cause)))}>Cancel safely</button> : null}
            {selected.status === "failed" || selected.status === "cancelled" ? <button className="primary-action" disabled={Boolean(activeExperiment)} onClick={() => void api<{ experiment: LearningExperimentState }>(`/api/experiments/${selected.id}/retry`, { method: "POST" }).then(({ experiment }) => { setSelectedId(experiment.id); setSelected(experiment); setError(""); }).catch((cause) => setError(String(cause)))}>{activeExperiment ? "Another experiment is running" : "Retry as a new run"}</button> : null}
          </section>

          {verdict ? <section className={`experiment-verdict verdict-${verdict.tone}`}><small>Scientific verdict</small><h3>{verdict.title}</h3><p>{verdict.detail}</p></section> : null}

          <section className="generation-list">
            <h3>Brain generations</h3>
            {selected.generations.map((generation) => (
              <article key={generation.generation} className="generation-card">
                <header><strong>Generation {generation.generation}</strong><span>{generation.brainIds.length} brains · {generation.species?.length ?? 0} species · {Math.round(generation.diversity * 100)}% behavioral diversity</span></header>
                <p>{generation.generation === 0 ? "Founder behavior baseline" : `${Math.round((generation.behaviorShift ?? 0) * 100)}% action-pattern change from the previous generation`}</p>
                <div className="metric-strip">{generation.medianFitness.map((value, index) => <Metric key={FITNESS_LABELS[index]} label={FITNESS_LABELS[index]} value={value} />)}</div>
                {generation.species?.length ? <details><summary>Species in this generation</summary><div className="brain-id-list">{generation.species.map((species) => <code key={species.speciesId}>{species.speciesId} · {species.memberIds.length} brains · distance {species.meanDistance.toFixed(3)}</code>)}</div></details> : null}
                <details><summary>Brain checkpoint IDs</summary><div className="brain-id-list">{generation.brainIds.map((id) => <code key={id}>{id}</code>)}</div></details>
                <button className="experiment-export" onClick={() => deployGeneration(generation)}>Deploy generation {generation.generation}</button>
              </article>
            ))}
          </section>

          {lineage.nodes.length ? <section className="lineage-explorer"><h3>Brain lineage</h3><p>Every preserved genome and structural mutation remains addressable. Lifetime memories are not inherited.</p>{inspectedBrain?.topology ? <><TopologyPreview topology={inspectedBrain.topology} /><small>Inspecting {inspectedBrain.brainId}{inspectedBrain.mutations?.length ? ` · ${inspectedBrain.mutations.map((mutation) => `${mutation.kind} ×${mutation.count}`).join(" · ")}` : " · founder topology"}</small></> : null}<div className="lineage-rows">{lineage.nodes.map((node) => { const parents = lineage.edges.filter((item) => item.childId === node.brainId); return <button type="button" key={node.brainId} className={node.brainId === inspectedBrain?.brainId ? "is-inspected" : ""} onClick={() => setInspectedBrainId(node.brainId)}><span className={`lineage-kind kind-${node.kind}`}>{node.kind}</span><span><strong>{node.brainId}</strong><small>{parents.length ? `${parents.map((edge) => edge.parentId).join(" + ")} → this brain · ${(parents[0].magnitude * 100).toFixed(1)}% mutation` : "generation-zero founder"}{node.speciesId ? ` · ${node.speciesId}` : ""}{node.topology ? ` · ${node.topology.nodes} nodes / ${node.topology.connections} connections` : ""}</small></span><code>{node.artifactHash?.slice(0, 10) ?? "pending"}</code></button>; })}</div></section> : null}

          {comparison.length ? <section className="control-comparison"><h3>Held-out comparison</h3>{comparison.map((item) => <article key={item.cohort}><strong>{item.cohort.replaceAll("-", " ")}</strong><Metric label="survival" value={item.survival} /><Metric label="body stability" value={item.stability} /><Metric label="action success" value={item.success} /><Metric label="unreachable" value={item.unreachable} /><CountMetric label="collapses / 100 person-days" value={item.collapses} /><CountMetric label="renewable food balance" value={item.foodBalance} /></article>)}</section> : null}
          {selected.error ? <p className="experiment-error">{selected.error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

