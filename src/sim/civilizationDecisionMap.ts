import { proposalLabel } from "./politics";
import type { ActionIntent, GoalMilestone, SimulationSnapshot } from "./types";

export type CivilizationMapNodeStatus = "locked" | "available" | "in-progress" | "completed" | "cancelled" | "active";

export interface CivilizationMapNode {
  id: string;
  kind: "objective" | "decision" | "milestone" | "outcome";
  lane: "objective" | "resources" | "construction" | "homes" | "civic" | "institutions" | "exchange" | "enterprise" | "outcome";
  label: string;
  detail: string;
  status: CivilizationMapNodeStatus;
  tick?: number;
  citizenId?: number;
  decisionId?: string;
  intentKind?: ActionIntent["kind"];
}

export interface CivilizationMapEdge {
  id: string;
  from: string;
  to: string;
  relation: "requires" | "choice" | "advanced" | "prepared" | "opposed";
  label: string;
}

export interface CivilizationDecisionMap {
  objectiveId: string;
  currentStage: SimulationSnapshot["civilizationGoal"]["stage"];
  nodes: CivilizationMapNode[];
  edges: CivilizationMapEdge[];
}

const milestoneLane: Partial<Record<GoalMilestone["id"], CivilizationMapNode["lane"]>> = {
  charter: "civic",
  currency: "institutions",
  property: "institutions",
  market: "exchange",
  business: "enterprise",
  employment: "enterprise",
  investment: "outcome",
};

const prerequisites: Partial<Record<GoalMilestone["id"], GoalMilestone["id"][]>> = {
  charter: [],
  currency: ["charter"],
  property: ["charter"],
  market: ["currency"],
  business: ["property"],
  employment: ["business"],
  investment: ["business"],
};

const coreIntents = new Set<ActionIntent["kind"]>(["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"]);

function affectedMilestones(kind: ActionIntent["kind"]): GoalMilestone["id"][] {
  switch (kind) {
    case "propose_market_charter":
    case "support_market_charter":
    case "oppose_market_charter":
      return ["charter"];
    case "propose_policy":
    case "cast_ballot":
    case "respond_to_vote":
      return ["shared-direction"];
    case "register_business":
      return ["property", "business"];
    case "list_good":
    case "buy_good":
      return ["market"];
    case "offer_job":
    case "accept_job":
      return ["employment"];
    case "invest_business":
      return ["investment"];
    default:
      return [];
  }
}

function decisionRelation(kind: ActionIntent["kind"]): Pick<CivilizationMapEdge, "relation" | "label"> {
  if (kind === "oppose_market_charter") return { relation: "opposed", label: "opposed" };
  if (kind === "propose_market_charter" || kind === "list_good" || kind === "offer_job") return { relation: "prepared", label: "prepared" };
  return { relation: "advanced", label: "advanced" };
}

function decisionLane(kind: ActionIntent["kind"]): CivilizationMapNode["lane"] {
  if (["fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "collect_water", "draw_water", "drink_water", "transfer_good"].includes(kind)) return "resources";
  if (["start_construction", "deliver_material", "work_construction", "cancel_project", "repair_structure", "demolish_structure"].includes(kind)) return "construction";
  if (kind === "move_home") return "homes";
  if (["propose_policy", "propose_public_project", "cast_ballot", "respond_to_vote", "form_faction", "join_faction", "organize_collective_action"].includes(kind)) return "civic";
  if (["lease_facility", "operate_recipe", "train_skill", "change_occupation"].includes(kind)) return "enterprise";
  return affectedMilestones(kind).map((milestone) => milestoneLane[milestone]).at(0) ?? "objective";
}

export function buildCivilizationDecisionMap(snapshot: SimulationSnapshot): CivilizationDecisionMap {
  const objectiveId = `objective:${snapshot.civilizationGoal.id}`;

  const completedMilestones = new Set(snapshot.civilizationGoal.milestones.filter((milestone) => milestone.completedAtTick !== undefined).map((milestone) => milestone.id));
  const recordedDecisions = [...snapshot.decisions]
    .filter((decision) => decision.selectedIntent && !coreIntents.has(decision.selectedIntent.kind))
    .sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id));
  const activeMilestones = new Set(recordedDecisions
    .filter((decision) => decision.actionStatus === "in-progress")
    .flatMap((decision) => affectedMilestones(decision.selectedIntent!.kind)));

  const nodes: CivilizationMapNode[] = [{
    id: objectiveId,
    kind: "objective",
    lane: "objective",
    label: snapshot.civilizationGoal.id === "none" ? "Open-ended settlement" : snapshot.civilizationGoal.prompt,
    detail: snapshot.civilizationGoal.id === "none" ? "No shared objective was imposed; this map records what citizens chose to make anyway." : "Citizens establish this direction through recorded choices, public ballots, and real consequences.",
    status: snapshot.civilizationGoal.id !== "none" && snapshot.civilizationGoal.milestones.length > 0 && snapshot.civilizationGoal.milestones.every((milestone) => milestone.completedAtTick !== undefined) ? "completed" : "active",
  }];
  const edges: CivilizationMapEdge[] = [];

  for (const milestone of snapshot.civilizationGoal.milestones) {
    const id = `milestone:${milestone.id}`;
    const requirements = prerequisites[milestone.id] ?? [];
    const available = requirements.every((requirement) => completedMilestones.has(requirement));
    nodes.push({
      id,
      kind: milestone.id === "investment" ? "outcome" : "milestone",
      lane: milestoneLane[milestone.id] ?? "outcome",
      label: milestone.label,
      detail: milestone.completedAtTick !== undefined ? `Completed at tick ${milestone.completedAtTick}.` : available ? "The required institutions exist; citizens can advance this step." : "Earlier institutions must be established first.",
      status: milestone.completedAtTick !== undefined ? "completed" : activeMilestones.has(milestone.id) ? "in-progress" : available ? "available" : "locked",
      ...(milestone.completedAtTick !== undefined ? { tick: milestone.completedAtTick } : {}),
    });
    if (!requirements.length) {
      edges.push({ id: `${objectiveId}->${id}`, from: objectiveId, to: id, relation: "requires", label: "begins with" });
    } else {
      for (const requirement of requirements) edges.push({ id: `milestone:${requirement}->${id}`, from: `milestone:${requirement}`, to: id, relation: "requires", label: "enables" });
    }
  }

  for (const proposal of Object.values(snapshot.politics.proposals).sort((left, right) => left.createdAtTick - right.createdAtTick)) {
    const id = `proposal:${proposal.id}`;
    nodes.push({
      id,
      kind: "outcome",
      lane: "civic",
      label: proposalLabel(proposal),
      detail: proposal.status === "voting" ? `${Object.keys(proposal.ballots).length}/${proposal.eligibleVoterIds.length} ballots returned.` : `${proposal.tally.support} support · ${proposal.tally.oppose} oppose · ${proposal.tally.abstain} abstain`,
      status: proposal.status === "voting" ? "in-progress" : proposal.status === "adopted" ? "completed" : "cancelled",
      tick: proposal.resolvedAtTick ?? proposal.createdAtTick,
      citizenId: proposal.sponsorId,
    });
    edges.push({ id: `${objectiveId}->${id}`, from: objectiveId, to: id, relation: "choice", label: "put to a vote" });
  }

  for (const decision of recordedDecisions) {
    const intent = decision.selectedIntent!;
    const id = `decision:${decision.id}`;
    nodes.push({
      id,
      kind: "decision",
      lane: decisionLane(intent.kind),
      label: decision.selectedLabel,
      detail: decision.actionStatus === "completed" ? decision.consequences.join(" ") : decision.actionStatus === "cancelled" ? decision.consequences.join(" ") : "This action is still in progress.",
      status: decision.actionStatus === "completed" ? "completed" : decision.actionStatus === "cancelled" ? "cancelled" : "in-progress",
      tick: decision.completedAtTick ?? decision.tick,
      citizenId: decision.citizenId,
      decisionId: decision.id,
      intentKind: intent.kind,
    });
    edges.push({ id: `${objectiveId}->${id}`, from: objectiveId, to: id, relation: "choice", label: "prompted" });
    if (intent.kind === "propose_policy") {
      const proposal = Object.values(snapshot.politics.proposals).find((item) => item.sponsorId === decision.citizenId && item.policyId === intent.policyId && item.createdAtTick >= decision.tick);
      if (proposal) edges.push({ id: `${id}->proposal:${proposal.id}`, from: id, to: `proposal:${proposal.id}`, relation: "prepared", label: "opened" });
    }
    if (intent.kind === "propose_public_project") {
      const proposal = Object.values(snapshot.politics.proposals).find((item) => item.sponsorId === decision.citizenId && item.projectPlan?.label === intent.plan.label && item.createdAtTick >= decision.tick);
      if (proposal) edges.push({ id: `${id}->proposal:${proposal.id}`, from: id, to: `proposal:${proposal.id}`, relation: "prepared", label: "opened" });
    }
    if (intent.kind === "cast_ballot") edges.push({ id: `${id}->proposal:${intent.proposalId}`, from: id, to: `proposal:${intent.proposalId}`, relation: intent.choice === "oppose" ? "opposed" : "advanced", label: intent.choice });
    if (intent.kind === "respond_to_vote") edges.push({ id: `proposal:${intent.proposalId}->${id}`, from: `proposal:${intent.proposalId}`, to: id, relation: "choice", label: intent.response });
    const relation = decisionRelation(intent.kind);
    for (const milestone of affectedMilestones(intent.kind)) {
      if (!snapshot.civilizationGoal.milestones.some((item) => item.id === milestone)) continue;
      edges.push({ id: `${id}->milestone:${milestone}`, from: id, to: `milestone:${milestone}`, ...relation });
    }
  }

  const decisionNodeId = (decisionId: string) => `decision:${decisionId}`;
  const decisionsWithIntent = recordedDecisions.filter((decision) => decision.selectedIntent);
  for (const decision of decisionsWithIntent) {
    const intent = decision.selectedIntent!;
    const to = decisionNodeId(decision.id);
    if (intent.kind === "deliver_material" || intent.kind === "work_construction") {
      const project = snapshot.physicalWorld.projects[intent.projectId];
      const start = project && decisionsWithIntent.find((candidate) => candidate.selectedIntent?.kind === "start_construction"
        && candidate.citizenId === project.requestedByCitizenId
        && candidate.completedAtTick === project.createdAtTick
        && candidate.selectedIntent.x === project.position.x
        && candidate.selectedIntent.y === project.position.y);
      if (start) edges.push({ id: `${decisionNodeId(start.id)}->${to}`, from: decisionNodeId(start.id), to, relation: "prepared", label: intent.kind === "deliver_material" ? "opened delivery" : "opened work" });
    }
    if (intent.kind === "work_construction") {
      const delivery = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "deliver_material" && candidate.selectedIntent.projectId === intent.projectId);
      if (delivery) edges.push({ id: `${decisionNodeId(delivery.id)}->${to}`, from: decisionNodeId(delivery.id), to, relation: "advanced", label: "supplied" });
    }
    if (intent.kind === "deliver_material" && intent.source === "inventory") {
      const harvestedKind = intent.resource === "wood" ? "fell_tree" : "quarry_stone";
      const harvest = [...decisionsWithIntent].reverse().find((candidate) => candidate.citizenId === decision.citizenId && candidate.tick <= decision.tick && candidate.selectedIntent?.kind === harvestedKind);
      if (harvest) edges.push({ id: `${decisionNodeId(harvest.id)}->${to}`, from: decisionNodeId(harvest.id), to, relation: "advanced", label: "supplied" });
    }
    if (intent.kind === "move_home") {
      const projectId = `project:${intent.buildingObjectUid}`;
      const build = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "work_construction" && candidate.selectedIntent.projectId === projectId);
      if (build) edges.push({ id: `${decisionNodeId(build.id)}->${to}`, from: decisionNodeId(build.id), to, relation: "advanced", label: "made habitable" });
    }
    if (intent.kind === "start_construction" && intent.mandateId) edges.push({ id: `proposal:${intent.mandateId}->${to}`, from: `proposal:${intent.mandateId}`, to, relation: "advanced", label: "authorized" });
    if ((intent.kind === "repair_structure" || intent.kind === "demolish_structure") && "mandateId" in intent && intent.mandateId) edges.push({ id: `proposal:${intent.mandateId}->${to}`, from: `proposal:${intent.mandateId}`, to, relation: "advanced", label: "authorized" });
    if (intent.kind === "sow_crop") {
      const prior = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "harvest_crop" && candidate.selectedIntent.nodeId === intent.nodeId);
      if (prior) edges.push({ id: `${decisionNodeId(prior.id)}->${to}`, from: decisionNodeId(prior.id), to, relation: "advanced", label: "opened next season" });
    }
    if (intent.kind === "tend_crop") {
      const prior = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "sow_crop" && candidate.selectedIntent.nodeId === intent.nodeId);
      if (prior) edges.push({ id: `${decisionNodeId(prior.id)}->${to}`, from: decisionNodeId(prior.id), to, relation: "advanced", label: "needed care" });
    }
    if (intent.kind === "operate_recipe") {
      const transfer = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "transfer_good" && candidate.selectedIntent.to.kind === intent.owner.kind && (candidate.selectedIntent.to.kind === "stock" || intent.owner.kind === "stock" || candidate.selectedIntent.to.id === intent.owner.id));
      if (transfer) edges.push({ id: `${decisionNodeId(transfer.id)}->${to}`, from: decisionNodeId(transfer.id), to, relation: "advanced", label: "supplied inputs" });
      const lease = [...decisionsWithIntent].reverse().find((candidate) => candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "lease_facility" && candidate.selectedIntent.buildingObjectUid === intent.facilityObjectUid);
      if (lease) edges.push({ id: `${decisionNodeId(lease.id)}->${to}`, from: decisionNodeId(lease.id), to, relation: "advanced", label: "opened workplace" });
    }
    if (intent.kind !== "adopt_commitment") {
      const commitment = [...decisionsWithIntent].reverse().find((candidate) => candidate.citizenId === decision.citizenId && candidate.tick <= decision.tick && candidate.selectedIntent?.kind === "adopt_commitment");
      if (commitment) edges.push({ id: `${decisionNodeId(commitment.id)}->${to}:commitment`, from: decisionNodeId(commitment.id), to, relation: "choice", label: "guided" });
    }
  }

  return { objectiveId, currentStage: snapshot.civilizationGoal.stage, nodes, edges };
}

