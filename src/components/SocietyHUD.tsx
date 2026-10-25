import { useMemo } from "react";
import { POLICY_DEFINITIONS, proposalLabel } from "../sim/politics";
import { useAppStore } from "../state/appStore";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const FOOD = ["cooked_meal", "berries", "meat", "bread", "fish", "wheat", "cabbage", "pumpkin"];

export function SocietyHUD() {
  const simulation = useAppStore((state) => state.simulation);
  const decisionMode = useAppStore((state) => state.decisionMode);
  const setDecisionMode = useAppStore((state) => state.setDecisionMode);
  const setPanel = useAppStore((state) => state.setPanel);
  const mode = useAppStore((state) => state.mode);

  const active = simulation?.politics.activeProposalId
    ? simulation.politics.proposals[simulation.politics.activeProposalId]
    : undefined;
  const voters = active?.eligibleVoterIds ?? [];
  const reacted = active && active.status !== "voting"
    ? voters.filter((id) => Boolean(simulation?.politics.citizens[id]?.reactions[active.id])).length
    : 0;
  const latestRequest = simulation?.requests.at(-1);
  const providerState = useMemo(() => {
    if (decisionMode === "mock") return { label: "Local lab", tone: "lab" };
    if (decisionMode === "local-brain") return { label: latestRequest?.status === "in-flight" ? "Brains thinking" : "Local brains", tone: latestRequest?.status === "in-flight" ? "thinking" : "brain" };
    return { label: "Local brains", tone: "brain" };
  }, [decisionMode, latestRequest]);

  if (mode !== "observe" || !simulation) return null;
  const policy = active ? POLICY_DEFINITIONS[active.policyId] : undefined;
  const activeLabel = active ? proposalLabel(active) : undefined;
  const ballotCount = active ? Object.keys(active.ballots).length : 0;
  const citizens = Object.values(simulation.citizens);
  const living = citizens.filter((citizen) => citizen.physical?.alive !== false);
  const deaths = citizens.length - living.length;
  const food = living.reduce((sum, citizen) => sum + FOOD.reduce((total, resource) => total + (citizen.inventory[resource] ?? 0), 0), 0)
    + FOOD.reduce((sum, resource) => sum + (simulation.stock[resource] ?? 0), 0);
  const sheltered = living.filter((citizen) => citizen.homeObjectUid !== undefined).length;
  const collapsed = living.filter((citizen) => citizen.physical?.incapacitatedSinceTick !== undefined).length;
  const critical = living.filter((citizen) => citizen.needs.hunger >= 0.85 || (citizen.needs.thirst ?? 0) >= 0.85 || (citizen.physical?.health ?? 1) <= 0.3).length;
  const activeProjects = Object.values(simulation.physicalWorld.projects).filter((project) => project.status !== "complete" && project.status !== "cancelled").length;
  const institution = simulation.politics.institutionStage === "none" ? "No government" : simulation.politics.institutionStage === "founding" ? "Founding vote" : "Formal institution";

  return (
    <>
      <section className="society-goal-ribbon wilderness-ribbon" aria-label="Live wilderness conditions">
        <span className="experiment-kicker">DAY {simulation.events[0]?.day ?? 1} · WILDERNESS WATCH</span>
        <strong>{living.length} alive · {deaths} dead · {food} carried food · {sheltered}/{living.length || 0} sheltered</strong>
        <div className="goal-dimensions wilderness-signals">
          <span className={critical ? "is-danger" : "is-safe"}>{critical} critical</span>
          {collapsed ? <span className="is-danger">{collapsed} collapsed</span> : null}
          <span>{activeProjects} projects</span>
          <span>{Object.keys(simulation.socialGroups).length} groups</span>
          <span>{institution}</span>
        </div>
        <button className={`mind-status mind-${providerState.tone}`} onClick={() => setDecisionMode(decisionMode === "local-brain" ? "mock" : "local-brain")} title={latestRequest?.reason ? `${latestRequest.reason}. Click to switch decision mode.` : "Switch decision mode"}>
          <i />{providerState.label}
        </button>
      </section>

      {active && policy ? (
        <section className={`assembly-overlay is-${active.status}`} aria-live="polite">
          <header>
            <span><small>PUBLIC ASSEMBLY · {active.status === "voting" ? "BALLOTS OPEN" : "RESULT DECLARED"}</small><h2>{activeLabel}</h2></span>
            <button onClick={() => setPanel("decisions")}>How did we get here? →</button>
          </header>
          <p>{active.projectPlan ? `${active.projectPlan.operation} · ${active.projectPlan.budget} shells · ${active.projectPlan.required.wood} wood · ${active.projectPlan.required.stone} stone · ${active.projectPlan.laborRequired} labor` : policy.description}</p>
          <div className="assembly-tally">
            <div className="tally-side supports"><strong>{active.tally.support}</strong><span>Support</span></div>
            <div className="turnout-ring"><strong>{active.status === "voting" ? `${ballotCount}/${voters.length}` : active.status === "adopted" ? active.projectPlan ? "YES" : "LAW" : "NO"}</strong><span>{active.status === "voting" ? "ballots" : active.status}</span></div>
            <div className="tally-side opposes"><strong>{active.tally.oppose}</strong><span>Oppose</span></div>
          </div>
          <div className="ballot-field" aria-label={`${ballotCount} of ${voters.length} villagers have voted`}>
            {voters.map((id) => {
              const ballot = active.ballots[id];
              const reaction = simulation.politics.citizens[id]?.reactions[active.id];
              const citizen = simulation.citizens[id];
              return <button key={id} className={`ballot-person choice-${ballot?.choice ?? "waiting"} ${reaction ? `reaction-${reaction}` : ""}`} title={`${citizen?.name ?? `Citizen ${id}`}: ${ballot?.choice ?? "waiting"}${reaction ? ` · ${reaction}` : ""}`} onClick={() => { useAppStore.getState().setSelectedCitizenId(id); setPanel("people"); }}>{citizen?.name?.slice(0, 1) ?? "?"}</button>;
            })}
          </div>
          <footer>
            {active.status === "voting" ? <span>Every villager must return a ballot before the result can resolve.</span> : <span>{reacted}/{voters.length} villagers have decided whether to accept, protest, organize, or rebel.</span>}
            <strong>{active.tally.abstain ? `${active.tally.abstain} abstained` : "Tie keeps the status quo"}</strong>
          </footer>
        </section>
      ) : null}

      <button className="society-pulse" onClick={() => setPanel("civilization")} aria-label="Open world pulse">
        <span><small>ALIVE</small><strong>{living.length}/{citizens.length}</strong></span>
        <i />
        <span><small>FOOD</small><strong>{food}</strong></span>
        <i />
        <span><small>SHELTER</small><strong>{living.length ? percent(sheltered / living.length) : "—"}</strong></span>
        {critical ? <b>{critical} AT RISK</b> : null}
      </button>
    </>
  );
}
