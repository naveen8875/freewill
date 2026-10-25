import { POLICY_DEFINITIONS } from "../sim/politics";
import type { SimulationSnapshot } from "../sim/types";

export function CivicLedger({ simulation }: { simulation: SimulationSnapshot }) {
  const { politics, civilizationGoal } = simulation;
  const laws = Object.values(politics.laws).sort((left, right) => right.enactedAtTick - left.enactedAtTick);
  const factions = Object.values(politics.factions).sort((left, right) => right.influence - left.influence);
  const actions = Object.values(politics.collectiveActions).filter((action) => action.status !== "resolved");
  return (
    <div className="civic-ledger">
      <section className="civic-constitution">
        <span><small>HOW POWER WORKS</small><strong>{politics.institutionStage === "none" ? "No shared authority" : politics.institutionStage === "founding" ? "Authority is being negotiated" : "Every recognized member · one ballot"}</strong></span>
        <span><small>ADMINISTRATION</small><strong>{politics.institutionStage === "none" ? "none" : politics.administration.form.replaceAll("-", " ")}</strong></span>
        <p>{politics.institutionStage === "none" ? "There is no public ownership, law, or universal vote. Households and groups act only through their members." : politics.institutionStage === "founding" ? "People are deciding whether to recognize a shared assembly. Until that resolves, no public law or project exists." : "A strict support majority passes a law. A tie preserves the status quo. Losing voters still choose their own response."}</p>
      </section>
      {civilizationGoal.dimensions.length ? (
        <section className="dimension-ledger">
          <h3>Goal pressures</h3>
          {civilizationGoal.dimensions.map((dimension) => <div key={dimension.id}><span>{dimension.label}</span><i><b style={{ width: `${Math.round(dimension.progress * 100)}%` }} /></i><strong>{Math.round(dimension.progress * 100)}</strong></div>)}
        </section>
      ) : null}
      <section className="law-ledger">
        <header><h3>Lawbook</h3><small>{laws.length} enacted</small></header>
        {laws.map((law) => <article key={law.proposalId}><span><strong>{POLICY_DEFINITIONS[law.policyId].label}</strong><small>Enacted T{law.enactedAtTick}</small></span><em>{law.support}–{law.oppose}</em></article>)}
        {!laws.length ? <p>No law has survived a public vote yet.</p> : null}
      </section>
      <section className="faction-ledger">
        <header><h3>Political movements</h3><small>{actions.length ? `${actions.length} active action${actions.length === 1 ? "" : "s"}` : "No active unrest"}</small></header>
        {factions.map((faction) => <article key={faction.id}><span><strong>{faction.name}</strong><small>{faction.memberIds.length} members · {Math.round(faction.radicalization * 100)}% radicalization</small></span><em>{Math.round(faction.influence * 100)}%</em></article>)}
        {!factions.length ? <p>Dissent exists as individual grievance until villagers choose to organize.</p> : null}
      </section>
    </div>
  );
}
