import { BUILDINGS, projectProgress } from "../sim/physicalWorld";
import type { SimulationSnapshot } from "../sim/types";
import { PixelThumb } from "./PixelThumb";

export function PhysicalWorldLedger({ simulation }: { simulation: SimulationSnapshot }) {
  const physical = simulation.physicalWorld;
  if (!physical.enabled) return null;
  const resources = Object.values(physical.resources);
  const projects = Object.values(physical.projects).filter((project) => project.status !== "cancelled").sort((a, b) => b.createdAtTick - a.createdAtTick);
  const buildings = Object.values(physical.buildings);
  const cropStages = resources.filter((node) => node.kind === "crop").reduce<Record<string, number>>((counts, node) => { counts[node.cropStage ?? (node.status === "available" ? "ripe" : "growing")] = (counts[node.cropStage ?? (node.status === "available" ? "ripe" : "growing")] ?? 0) + 1; return counts; }, {});
  const roads = Object.values(physical.roads);
  const escrows = Object.values(physical.escrows);
  const activeMandates = Object.values(physical.mandates).filter((mandate) => mandate.status === "authorized" || mandate.status === "claimed");
  const foodLots = Object.values(physical.foodLots);
  const homeless = Object.values(simulation.citizens).filter((citizen) => !citizen.homeObjectUid).length;
  return (
    <section className="physical-ledger" aria-label="Physical settlement projects">
      <header><span>Physical settlement</span><strong>{projects.filter((project) => project.status !== "complete").length} active</strong></header>
      <div className="physical-summary">
        <div><small>Standing trees</small><strong>{resources.filter((node) => node.kind === "tree" && node.status === "available").length}</strong></div>
        <div><small>Mineral deposits</small><strong>{resources.filter((node) => node.kind === "stone" && node.status === "available").length}</strong></div>
        <div><small>Ripe crops</small><strong>{resources.filter((node) => node.kind === "crop" && node.status === "available").length}</strong></div>
        <div><small>Fish stock</small><strong>{Math.floor(physical.renewableStocks.fish?.amount ?? 0)}/{physical.renewableStocks.fish?.capacity ?? 0}</strong></div>
        <div><small>Water table</small><strong>{Math.floor(physical.renewableStocks.water?.amount ?? 0)}/{physical.renewableStocks.water?.capacity ?? 0}</strong></div>
        <div><small>Buildings</small><strong>{buildings.length}</strong></div>
        <div><small>Without homes</small><strong>{homeless}</strong></div>
        <div><small>Road tiles</small><strong>{roads.length}</strong></div>
        <div><small>Cleared sites</small><strong>{Object.keys(physical.demolitions).length}</strong></div>
      </div>
      <div className="settlement-cycle" aria-label="Living settlement cycle">
        <span><b>{cropStages.fallow ?? 0}</b> fallow</span>
        <span><b>{(cropStages.sown ?? 0) + (cropStages.growing ?? 0)}</b> growing</span>
        <span><b>{cropStages.ripe ?? 0}</b> ripe</span>
        <span><b>{foodLots.reduce((sum, lot) => sum + lot.amount, 0)}</b> fresh food</span>
        <span><b>{physical.waste}</b> spoiled</span>
      </div>
      {(activeMandates.length || escrows.some((escrow) => escrow.status === "held")) ? (
        <div className="public-works-strip">
          <strong>Public works</strong>
          <span>{activeMandates.length} mandate{activeMandates.length === 1 ? "" : "s"}</span>
          <span>{escrows.filter((escrow) => escrow.status === "held").reduce((sum, escrow) => sum + escrow.balance, 0)} ◉ protected</span>
        </div>
      ) : null}
      <div className="project-list">
        {projects.slice(0, 8).map((project) => {
          const definition = BUILDINGS[project.buildingType];
          const progress = Math.round(projectProgress(project) * 100);
          return (
            <article key={project.id} data-status={project.status}>
              <PixelThumb asset={definition.assetId} scale={1} />
              <div>
                <span><strong>{definition.label} #{project.objectUid}</strong><small>{project.status === "complete" ? "Operational" : `${progress}% built`} · {project.owner.kind === "public" ? "public" : project.owner.kind === "citizen" ? simulation.citizens[project.owner.id]?.name ?? "private" : simulation.economy.businesses[project.owner.id]?.name ?? "business"}</small></span>
                <i><b style={{ width: `${progress}%` }} /></i>
                <p>{Object.entries(project.required).map(([resource, amount]) => `${project.delivered[resource] ?? 0}/${amount} ${resource}`).join(" · ")} · {project.laborCompleted}/{project.laborRequired} labor</p>
                {project.escrowId && physical.escrows[project.escrowId] ? <p>Escrow {physical.escrows[project.escrowId].balance}/{physical.escrows[project.escrowId].deposited} ◉ · {physical.escrows[project.escrowId].spent} paid</p> : null}
                {project.status === "complete" ? <p>{definition.effect}</p> : null}
              </div>
            </article>
          );
        })}
        {!projects.length ? <p className="physical-empty">No construction project yet. Builders can choose a valid site when housing is needed.</p> : null}
      </div>
      {buildings.some((building) => building.condition < 0.75) || roads.some((road) => road.condition < 0.75) ? (
        <div className="maintenance-list">
          <strong>Needs maintenance</strong>
          {buildings.filter((building) => building.condition < 0.75).slice(0, 3).map((building) => <span key={`building-${building.objectUid}`}><i style={{ width: `${Math.round(building.condition * 100)}%` }} />{BUILDINGS[building.buildingType].label} #{building.objectUid} · {Math.round(building.condition * 100)}%</span>)}
          {roads.filter((road) => road.condition < 0.75).slice(0, 2).map((road) => <span key={road.id}><i style={{ width: `${Math.round(road.condition * 100)}%` }} />road {road.position.x},{road.position.y} · {Math.round(road.condition * 100)}%</span>)}
        </div>
      ) : null}
    </section>
  );
}
