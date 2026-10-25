import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildCivilizationDecisionMap, type CivilizationMapNode } from "../sim/civilizationDecisionMap";
import type { EconomicTransaction, SimulationSnapshot } from "../sim/types";
import { useAppStore } from "../state/appStore";
import { selectCitizen } from "../state/worldCommands";
import { PixelThumb } from "./PixelThumb";

const STAGE_LABELS: Record<SimulationSnapshot["civilizationGoal"]["stage"], string> = {
  inactive: "No shared economic direction",
  experiment: "The experiment is taking shape",
  founding: "Writing the market charter",
  "property-rights": "Defining ownership",
  "active-market": "Opening the market",
  enterprise: "Growing enterprises",
  "capital-formation": "Reinvesting capital",
  complete: "The shared goal has been reached",
};

const MILESTONE_ASSETS: Record<string, { asset: string; variant?: number }> = {
  charter: { asset: "priceboard" },
  currency: { asset: "coinpile", variant: 1 },
  property: { asset: "stake" },
  market: { asset: "stall" },
  business: { asset: "shopsign" },
  employment: { asset: "shopsign", variant: 1 },
  investment: { asset: "countinghouse" },
};

const LANE_LABELS: Array<[CivilizationMapNode["lane"], string]> = [
  ["objective", "Shared goal"],
  ["resources", "Materials"],
  ["construction", "Building"],
  ["homes", "Settlement life"],
  ["civic", "Agreement"],
  ["institutions", "Institutions"],
  ["exchange", "Exchange"],
  ["enterprise", "Enterprise"],
  ["outcome", "Outcome"],
];

const WEALTH_COLORS = ["#c96b43", "#4f8e36", "#e2604d", "#2f7fc7", "#e0a52a", "#248a7e", "#7a6657", "#9ccb76"];

function transactionLabel(transaction: EconomicTransaction, citizens: SimulationSnapshot["citizens"]) {
  const person = (id: string) => {
    const citizenId = Number(id.replace("citizen:", ""));
    return citizens[citizenId]?.name ?? id.replace(/^business:|^citizen:|^settlement:/, "");
  };
  if (transaction.kind === "trade") return `${person(transaction.fromId)} bought ${transaction.amount ?? 0} ${transaction.resource ?? "goods"} from ${person(transaction.toId)}`;
  if (transaction.kind === "investment") return `${person(transaction.fromId)} invested ${transaction.money} shells`;
  if (transaction.kind === "wage") return `${person(transaction.toId)} earned ${transaction.money} shells`;
  return `${person(transaction.toId)} received ${transaction.money} founding shells`;
}

function nodeAsset(node: CivilizationMapNode) {
  const milestoneId = node.id.replace("milestone:", "");
  if (MILESTONE_ASSETS[milestoneId]) return MILESTONE_ASSETS[milestoneId];
  if (node.kind === "objective") return { asset: "priceboard" };
  if (node.intentKind === "fell_tree") return { asset: "oak" };
  if (node.intentKind === "quarry_stone") return { asset: "rock" };
  if (node.intentKind === "harvest_crop") return { asset: "wheat", variant: 2 };
  if (node.intentKind === "start_construction" || node.intentKind === "deliver_material" || node.intentKind === "work_construction") return { asset: "cottage" };
  if (node.intentKind === "move_home") return { asset: "cottage" };
  if (node.intentKind === "register_business" || node.intentKind === "offer_job" || node.intentKind === "accept_job") return { asset: "shopsign", variant: node.intentKind === "register_business" ? 0 : 1 };
  if (node.intentKind === "buy_good" || node.intentKind === "list_good") return { asset: "stall" };
  if (node.intentKind === "invest_business") return { asset: "countinghouse" };
  if (node.intentKind === "operate_recipe") return { asset: "bakery" };
  if (node.intentKind === "lease_facility") return { asset: "shopsign", variant: 0 };
  if (node.intentKind === "transfer_good") return { asset: "crate" };
  if (node.intentKind === "train_skill" || node.intentKind === "change_occupation") return { asset: "shopsign", variant: 1 };
  if (node.intentKind?.includes("charter")) return { asset: "stake" };
  return { asset: "coinpile" };
}

function DecisionMap({ simulation, onClose }: { simulation: SimulationSnapshot; onClose(): void }) {
  const map = useMemo(() => buildCivilizationDecisionMap(simulation), [simulation]);
  const lanes = useMemo(() => LANE_LABELS.map(([id, label]) => {
    const laneNodes = map.nodes.filter((node) => node.lane === id);
    const fixed = laneNodes.filter((node) => node.kind !== "decision");
    const decisions = laneNodes.filter((node) => node.kind === "decision").slice(-4);
    return { id, label, nodes: [...fixed, ...decisions] };
  }), [map]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="economy-map-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="economy-map-dialog" role="dialog" aria-modal="true" aria-labelledby="economy-map-title">
        <header>
          <span>
            <small>Decision map · live simulation</small>
            <h2 id="economy-map-title">How this society came to be</h2>
            <p>Follow real choices from harvested materials and buildings to votes, institutions, and outcomes.</p>
          </span>
          <button onClick={onClose} autoFocus>Close</button>
        </header>
        <div className="economy-map-scroll">
          <div className="economy-map-lanes" aria-label="Civilization decision map">
            {lanes.map((lane, laneIndex) => (
              <section className="economy-map-lane" key={lane.id}>
                <h3>{lane.label}</h3>
                <div>
                  {lane.nodes.map((node) => {
                    const art = nodeAsset(node);
                    return (
                      <article className={`economy-map-node is-${node.status} kind-${node.kind}`} key={node.id}>
                        <PixelThumb asset={art.asset} variant={art.variant} scale={node.kind === "objective" ? 1 : 2} />
                        <span>
                          <strong>{node.label}</strong>
                          <p>{node.detail}</p>
                          {node.tick !== undefined ? <small>Tick {node.tick}</small> : <small>{node.status.replace("-", " ")}</small>}
                        </span>
                      </article>
                    );
                  })}
                  {!lane.nodes.length ? <div className="economy-map-gap">This part of the story has not begun.</div> : null}
                </div>
                {laneIndex < lanes.length - 1 ? <i className="economy-map-arrow" aria-hidden="true">›</i> : null}
              </section>
            ))}
          </div>
        </div>
        <footer>
          <span><i className="legend-complete" /> completed</span>
          <span><i className="legend-open" /> available now</span>
          <span><i className="legend-locked" /> requires an earlier step</span>
          <strong>{map.nodes.filter((node) => node.kind === "decision").length} consequential choices recorded</strong>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export function DecisionMapLauncher({ simulation, label = "Decision map" }: { simulation: SimulationSnapshot | null; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!simulation) return null;
  return (
    <>
      <button className="decision-map-action" onClick={() => setOpen(true)}>{label}</button>
      {open ? <DecisionMap simulation={simulation} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function EconomyLedger({ simulation }: { simulation: SimulationSnapshot | null }) {
  const [view, setView] = useState<"overview" | "market" | "people">("overview");
  const setSocietyGoal = useAppStore((state) => state.setSocietyGoal);

  if (!simulation || simulation.civilizationGoal.id !== "market-economy") {
    return (
      <section className="economy-intro">
        <span className="economy-intro-art"><PixelThumb asset="coinpile" variant={2} scale={4} /></span>
        <h3>Give the village an economic goal</h3>
        <p>Citizens can establish property, currency, trade, businesses, jobs, and investment through their own decisions.</p>
        <button onClick={() => setSocietyGoal("market-economy")}>Build a market economy</button>
      </section>
    );
  }

  const { economy, civilizationGoal: goal, citizens } = simulation;
  const people = Object.values(citizens).sort((left, right) => left.id - right.id);
  const businesses = Object.values(economy.businesses).sort((left, right) => left.createdAtTick - right.createdAtTick);
  const offers = Object.values(economy.offers).filter((offer) => offer.status === "open").sort((left, right) => left.unitPrice - right.unitPrice);
  const contracts = Object.values(economy.contracts).filter((contract) => contract.status === "offered" || contract.status === "active");
  const businessCapital = new Map<number, number>();
  businesses.forEach((business) => businessCapital.set(business.ownerId, (businessCapital.get(business.ownerId) ?? 0) + business.capital));
  const wealth = people.map((person, index) => ({ person, amount: (economy.wallets[person.id] ?? 0) + (businessCapital.get(person.id) ?? 0), color: WEALTH_COLORS[index % WEALTH_COLORS.length] }));
  const totalRecordedWealth = wealth.reduce((total, entry) => total + entry.amount, 0);
  const completed = goal.milestones.filter((milestone) => milestone.completedAtTick !== undefined).length;
  const nextMilestone = goal.milestones.find((milestone) => milestone.completedAtTick === undefined);
  const indicators = [
    ["Wealth", Math.min(1, economy.indicators.medianWealth / 20), "#e0a52a"],
    ["Fairness", Math.max(0, 1 - economy.indicators.wealthConcentration), "#2f7fc7"],
    ["Growth", Math.min(1, (economy.indicators.activeBusinesses + economy.indicators.activeOffers + economy.indicators.tradeVolume / 5) / Math.max(1, people.length)), "#4f8e36"],
    ["Stability", Math.max(0, 1 - economy.indicators.citizensWithSevereNeeds / Math.max(1, people.length)), "#c96b43"],
  ] as const;

  return (
    <>
      <section className="economy-stage-card">
        <div className="economy-stage-title">
          <span><PixelThumb asset={completed < 2 ? "stake" : completed < 5 ? "shopsign" : "countinghouse"} scale={2} /></span>
          <div><small>{completed} of {goal.milestones.length} foundations in place</small><h3>{STAGE_LABELS[goal.stage]}</h3><p>{nextMilestone ? `Next: ${nextMilestone.label}` : "The founding goal is complete. The choices still shape who benefits."}</p></div>
        </div>
        <DecisionMapLauncher simulation={simulation} />
        <div className="economy-milestones" aria-label="Market economy milestones">
          {goal.milestones.map((milestone) => {
            const art = MILESTONE_ASSETS[milestone.id];
            const isNext = milestone.id === nextMilestone?.id;
            return <div key={milestone.id} className={milestone.completedAtTick !== undefined ? "is-complete" : isNext ? "is-next" : "is-locked"} title={milestone.label}><PixelThumb asset={art.asset} variant={art.variant} scale={2} /><span>{milestone.id}</span></div>;
          })}
        </div>
      </section>

      <nav className="ledger-tabs" aria-label="Economy ledger views">
        {(["overview", "market", "people"] as const).map((tab) => <button key={tab} className={view === tab ? "is-active" : ""} onClick={() => setView(tab)}>{tab}</button>)}
      </nav>

      {view === "overview" ? (
        <>
          <section className="economy-kpis" aria-label="Economy summary">
            <div><PixelThumb asset="coinpile" variant={1} scale={2} /><span><small>Money supply</small><strong>{economy.moneySupply}</strong></span></div>
            <div><PixelThumb asset="icon_deal" scale={3} /><span><small>Trade volume</small><strong>{economy.indicators.tradeVolume}</strong></span></div>
            <div><PixelThumb asset="shopsign" scale={2} /><span><small>Businesses</small><strong>{economy.indicators.activeBusinesses}</strong></span></div>
            <div><PixelThumb asset="shopsign" variant={1} scale={2} /><span><small>Employed</small><strong>{economy.indicators.employedCitizens}</strong></span></div>
          </section>
          <section className="economy-health">
            <h3>Settlement economy</h3>
            {indicators.map(([label, value, color]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.round(value * 100)}%`, background: color }} /></i><strong>{Math.round(value * 100)}</strong></div>)}
          </section>
          <section className="wealth-share">
            <header><h3>Share of recorded wealth</h3><small>Wallets plus business capital</small></header>
            <div className="wealth-stack">{wealth.map((entry) => <i key={entry.person.id} title={`${entry.person.name}: ${entry.amount} shells`} style={{ width: `${totalRecordedWealth ? entry.amount / totalRecordedWealth * 100 : 100 / Math.max(1, wealth.length)}%`, background: entry.color }} />)}</div>
            <div className="wealth-legend">{wealth.map((entry) => <button key={entry.person.id} onClick={() => selectCitizen(entry.person.id)}><i style={{ background: entry.color }} /><span>{entry.person.name}</span><strong>{entry.amount}</strong></button>)}</div>
          </section>
          <section className="ledger-feed">
            <header><h3>Latest exchanges</h3><button onClick={() => setView("market")}>Open market</button></header>
            {economy.transactions.slice(-4).reverse().map((transaction) => <article key={transaction.id}><PixelThumb asset={transaction.kind === "investment" ? "countinghouse" : transaction.kind === "trade" ? "icon_deal" : "coinpile"} scale={2} /><span><strong>{transactionLabel(transaction, citizens)}</strong><small>Tick {transaction.tick} · {transaction.kind}</small></span></article>)}
            {!economy.transactions.length ? <p>The ledger is empty. The first charter vote will begin the story.</p> : null}
          </section>
        </>
      ) : null}

      {view === "market" ? (
        <>
          <section className="market-section">
            <header><h3>Businesses</h3><small>{businesses.length} registered</small></header>
            {businesses.map((business) => {
              const premises = business.facilityObjectUids.length;
              return <article key={business.id}><PixelThumb asset={business.kind === "merchant" ? "stall" : business.kind === "baker" ? "bakery" : business.kind === "smith" ? "blacksmith" : "shopsign"} scale={2} /><span><strong>{business.name}</strong><small>{citizens[business.ownerId]?.name ?? "Unknown owner"} · {business.employeeIds.length} workers · {premises} facilities · {business.productionRuns} batches</small>{business.blockers[0] ? <small className="business-blocker">Blocked: {business.blockers[0]}</small> : <small>Production chain ready</small>}</span><em>{business.capital} ◉</em></article>;
            })}
            {!businesses.length ? <p>No businesses yet. Property rights must exist before someone can register one.</p> : null}
          </section>
          <section className="market-section">
            <header><h3>Physical production</h3><small>{economy.production.length} recorded batches</small></header>
            {economy.production.slice(0, 8).map((batch) => <article key={batch.id}><PixelThumb asset={batch.recipeId === "bake-bread" ? "bakery" : batch.recipeId === "forge-tools" ? "blacksmith" : "crate"} scale={2} /><span><strong>{batch.recipeId.replaceAll("-", " ")}</strong><small>{Object.entries(batch.inputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} → {Object.entries(batch.outputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} · facility #{batch.facilityObjectUid}</small></span><em>T{batch.completedAtTick}</em></article>)}
            {!economy.production.length ? <p>No recipe has completed yet. Registered firms still need a physical facility, owned inputs, and skilled labor.</p> : null}
          </section>
          <section className="market-section">
            <header><h3>Open offers</h3><small>{offers.length} on the board</small></header>
            {offers.slice(0, 8).map((offer) => <article key={offer.id}><PixelThumb asset="priceboard" scale={2} /><span><strong>{offer.amountRemaining} {offer.resource}</strong><small>{citizens[offer.sellerId]?.name ?? "Seller"} · expires T{offer.expiresAtTick}</small></span><em>{offer.unitPrice} ◉</em></article>)}
            {!offers.length ? <p>The price board is clear. Sellers will post goods after currency and property are adopted.</p> : null}
          </section>
          <section className="market-section">
            <header><h3>Work contracts</h3><small>{contracts.length} live</small></header>
            {contracts.map((contract) => <article key={contract.id}><PixelThumb asset="shopsign" variant={1} scale={2} /><span><strong>{citizens[contract.workerId]?.name ?? "Worker"}</strong><small>{economy.businesses[contract.businessId]?.name ?? "Business"} · {contract.status}</small></span><em>{contract.wage} ◉</em></article>)}
            {!contracts.length ? <p>No active wage offers. Businesses can hire after the charter unlocks contracts.</p> : null}
          </section>
        </>
      ) : null}

      {view === "people" ? (
        <section className="wallet-ledger">
          <header><h3>People and ownership</h3><small>{people.length} citizens</small></header>
          {[...wealth].sort((left, right) => right.amount - left.amount || left.person.id - right.person.id).map((entry, rank) => {
            const owned = businesses.filter((business) => business.ownerId === entry.person.id);
            const ownedBusinessIds = new Set(owned.map((business) => business.id));
            const ownedBuildings = Object.values(simulation.physicalWorld.buildings).filter((building) => building.owner.kind === "citizen" ? building.owner.id === entry.person.id : building.owner.kind === "business" && ownedBusinessIds.has(building.owner.id));
            const employed = contracts.find((contract) => contract.workerId === entry.person.id && contract.status === "active");
            const role = owned.length ? `Owns ${owned.map((business) => business.name).join(", ")}` : employed ? `Works at ${economy.businesses[employed.businessId]?.name ?? "a business"}` : entry.person.job;
            return <button key={entry.person.id} onClick={() => selectCitizen(entry.person.id)}><span className="wallet-rank">{rank + 1}</span><PixelThumb asset="villager" scale={3} /><span><strong>{entry.person.name}</strong><small>{role}{ownedBuildings.length ? ` · ${ownedBuildings.length} building${ownedBuildings.length === 1 ? "" : "s"}` : ""}</small></span><em>{entry.amount} ◉</em></button>;
          })}
        </section>
      ) : null}

    </>
  );
}
