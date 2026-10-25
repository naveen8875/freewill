import type { ActionCandidate, ActionIntent, CitizenState, DecisionContext, SimulationEvent, SocialGroupState, SocialPromiseState } from "./types.js";
import { legacyDurationTicks } from "./time.js";

const food = ["cooked_meal", "berries", "meat", "bread", "fish", "wheat", "cabbage", "pumpkin"];
const candidate = (id: string, label: string, intent: ActionIntent): ActionCandidate => ({ id, label, intent, legal: true, score: null, trace: [] });
const distance = (a: CitizenState, b: CitizenState) => Math.abs(a.position.x - b.position.x) + Math.abs(a.position.y - b.position.y);

export function buildSocialCandidates(context: DecisionContext): ActionCandidate[] {
  const { citizen } = context;
  if (citizen.physical?.alive === false) return [];
  const others = context.citizens.filter((other) => other.id !== citizen.id && other.physical?.alive !== false).sort((a, b) => distance(citizen, a) - distance(citizen, b) || a.id - b.id);
  const results: ActionCandidate[] = [];
  const needyResource = food.find((resource) => (citizen.inventory[resource] ?? 0) < 1);
  const donor = needyResource ? others.find((other) => (other.inventory[needyResource] ?? 0) > 1) : undefined;
  if (donor && citizen.needs.hunger >= 0.5) results.push(candidate(`request-${needyResource}-${donor.id}-${citizen.id}`, `Ask ${donor.name} for 1 ${needyResource}`, { kind: "request_item", targetCitizenId: donor.id, resource: needyResource!, amount: 1 }));
  const hungry = others.find((other) => other.needs.hunger >= 0.62);
  const gift = food.find((resource) => (citizen.inventory[resource] ?? 0) > 1);
  if (hungry && gift) results.push(candidate(`share-${gift}-${hungry.id}-${citizen.id}`, `Give ${hungry.name} 1 ${gift}`, { kind: "share_item", targetCitizenId: hungry.id, resource: gift, amount: 1 }));
  if (donor && citizen.needs.hunger >= 0.82) results.push(candidate(`steal-${needyResource}-${donor.id}-${citizen.id}`, `Secretly take 1 ${needyResource} from ${donor.name}`, { kind: "steal_item", targetCitizenId: donor.id, resource: needyResource!, amount: 1 }));
  const carriedAidFood = food.some((resource) => (citizen.inventory[resource] ?? 0) >= 1);
  const carriedAidWater = (citizen.inventory.clean_water ?? 0) + (citizen.inventory.water ?? 0) >= 1;
  const endangered = others.find((other) => {
    const recentlyHelped = context.tick - (other.physical?.lastRescuedAtTick ?? -1_000) < 12;
    const collapsed = other.physical?.incapacitatedSinceTick !== undefined || (other.physical?.health ?? 1) <= 0.16 || (other.physical?.injury ?? 0) >= 0.82 || other.needs.fatigue >= 0.98;
    const practicalAid = (other.physical?.exposure ?? 0) >= 0.62 || (other.physical?.injury ?? 0) >= 0.72 || other.needs.fatigue >= 0.96
      || (other.needs.hunger < 0.92 || carriedAidFood) && ((other.needs.thirst ?? 0) < 0.92 || carriedAidWater);
    return !recentlyHelped && collapsed && practicalAid;
  });
  if (endangered) results.push(candidate(`rescue-${endangered.id}-${citizen.id}`, `Help ${endangered.name} survive their collapse`, { kind: "rescue_person", targetCitizenId: endangered.id }));
  const barterPartner = others.find((other) => Object.entries(other.inventory).some(([resource, amount]) => amount >= 1 && (citizen.inventory[resource] ?? 0) < 1));
  const barterOffer = Object.entries(citizen.inventory).find(([, amount]) => amount > 1)?.[0];
  const barterRequest = barterPartner ? Object.entries(barterPartner.inventory).find(([resource, amount]) => amount >= 1 && (citizen.inventory[resource] ?? 0) < 1)?.[0] : undefined;
  if (barterPartner && barterOffer && barterRequest && barterOffer !== barterRequest) results.push(candidate(`barter-${citizen.id}-${barterPartner.id}-${barterOffer}-${barterRequest}`, `Offer ${barterPartner.name} 1 ${barterOffer} for 1 ${barterRequest}`, { kind: "barter_item", targetCitizenId: barterPartner.id, offerResource: barterOffer, requestResource: barterRequest, amount: 1 }));
  const activeProject = Object.values(context.physicalWorld?.projects ?? {}).find((project) => project.status !== "complete" && project.status !== "cancelled");
  if (activeProject && activeProject.requestedByCitizenId !== citizen.id && citizen.commitment?.status !== "active") {
    const requester = others.find((other) => other.id === activeProject.requestedByCitizenId);
    if (requester) results.push(candidate(`offer-project-${activeProject.id}-${citizen.id}`, `Offer ${requester.name} help with the ${activeProject.buildingType}`, { kind: "offer_project_help", targetCitizenId: requester.id, projectId: activeProject.id }));
  }
  if (activeProject?.requestedByCitizenId === citizen.id) {
    const helper = others.find((other) => other.commitment?.status !== "active" && (citizen.socialRelationships?.[other.id]?.trust ?? citizen.relationships[other.id] ?? 0.5) >= 0.52);
    if (helper) results.push(candidate(`invite-project-${activeProject.id}-${helper.id}`, `Ask ${helper.name} to help finish the ${activeProject.buildingType}`, { kind: "invite_project", targetCitizenId: helper.id, projectId: activeProject.id }));
  }
  const technique = citizen.knowledge?.learnedTechniques.find((known) => others.some((other) => !other.knowledge?.learnedTechniques.includes(known)));
  const student = technique ? others.find((other) => !other.knowledge?.learnedTechniques.includes(technique)) : undefined;
  if (technique && student) results.push(candidate(`teach-${technique}-${student.id}-${citizen.id}`, `Teach ${student.name} ${technique.replaceAll("-", " ")}`, { kind: "teach_technique", targetCitizenId: student.id, technique }));
  const reportable = citizen.knowledge?.knownResources.find((nodeId) => others.some((other) => !other.knowledge?.knownResources.includes(nodeId)));
  const listener = reportable ? others.find((other) => !other.knowledge?.knownResources.includes(reportable)) : undefined;
  if (reportable && listener) results.push(candidate(`warn-${reportable}-${listener.id}-${citizen.id}`, `Tell ${listener.name} where to find ${reportable}`, { kind: "warn_resource", targetCitizenId: listener.id, nodeId: reportable }));
  const secret = citizen.knowledge?.knownResources.find((nodeId) => others.some((other) => !other.knowledge?.knownResources.includes(nodeId)));
  if (secret && (citizen.personality?.acquisitiveness ?? 0.5) >= 0.64) results.push(candidate(`conceal-${secret}-${citizen.id}`, `Keep the location of ${secret} to themselves`, { kind: "conceal_resource", nodeId: secret }));
  const trusted = others.find((other) => (citizen.socialRelationships?.[other.id]?.trust ?? citizen.relationships[other.id] ?? 0.5) >= 0.64 && !other.householdId);
  if (!citizen.householdId && trusted) results.push(candidate(`household-${citizen.id}-${trusted.id}`, `Ask ${trusted.name} to form a household`, { kind: "form_household", targetCitizenId: trusted.id }));
  const groupMate = others.find((other) => (citizen.socialRelationships?.[other.id]?.trust ?? citizen.relationships[other.id] ?? 0.5) >= 0.6 && !(other.groupIds?.length));
  if (!(citizen.groupIds?.length) && groupMate) results.push(candidate(`group-${citizen.id}-${groupMate.id}`, `Invite ${groupMate.name} to form a persistent group`, { kind: "form_group", targetCitizenId: groupMate.id }));
  const groupId = citizen.groupIds?.find((id) => context.socialGroups?.[id]);
  const group = groupId ? context.socialGroups?.[groupId] : undefined;
  if (group) {
    const invitee = others.find((other) => !(other.groupIds?.length) && (citizen.socialRelationships?.[other.id]?.trust ?? citizen.relationships[other.id] ?? 0.5) >= 0.58);
    if (invitee) results.push(candidate(`invite-${group.id}-${citizen.id}-${invitee.id}`, `Invite ${invitee.name} into ${group.name}`, { kind: "invite_group", groupId: group.id, targetCitizenId: invitee.id }));
    if (group.memberIds.length >= 3 && group.decisionSystem === "informal" && (group.founderId === citizen.id || group.leaderId === citizen.id)) {
      for (const system of ["leader", "majority", "consensus", "council"] as const) {
        if (system === "council" && group.memberIds.length < 5) continue;
        results.push(candidate(`group-system-${group.id}-${system}-${citizen.id}`, `Suggest ${system} decision-making for ${group.name}`, { kind: "adopt_group_system", groupId: group.id, system }));
      }
    }
    const contribution = ["branches", "fiber", "stone", "wood", "clay"].find((resource) => (citizen.inventory[resource] ?? 0) > 1);
    if (contribution) results.push(candidate(`contribute-${group.id}-${contribution}-${citizen.id}`, `Contribute 1 ${contribution} to ${group.name}`, { kind: "contribute_group_stock", groupId: group.id, resource: contribution, amount: 1 }));
    if ((citizen.personality?.independence ?? 0.5) >= 0.78 || (citizen.emotions?.resentment ?? 0) >= 0.65) results.push(candidate(`leave-${group.id}-${citizen.id}`, `Leave ${group.name}`, { kind: "leave_group", groupId: group.id }));
    if (group.founderId === citizen.id || group.leaderId === citizen.id) {
      const excluded = group.memberIds.map((id) => context.citizens.find((person) => person.id === id)).find((person) => person && person.id !== citizen.id && (citizen.socialRelationships?.[person.id]?.grievance ?? 0) >= 0.45);
      if (excluded) results.push(candidate(`exclude-${group.id}-${excluded.id}`, `Exclude ${excluded.name} from ${group.name}`, { kind: "exclude_member", groupId: group.id, targetCitizenId: excluded.id }));
    }
  }
  const openPromise = Object.values(context.socialPromises ?? {}).find((promise) => promise.fromCitizenId === citizen.id && promise.status === "open" && (citizen.inventory[promise.resource] ?? 0) >= promise.amount);
  if (openPromise) results.push(candidate(`fulfill-${openPromise.id}`, `Fulfill the promise of ${openPromise.amount} ${openPromise.resource}`, { kind: "fulfill_promise", promiseId: openPromise.id, targetCitizenId: openPromise.toCitizenId }));
  const personInNeed = others.find((other) => other.needs.hunger >= 0.72);
  if (personInNeed && !Object.values(context.socialPromises ?? {}).some((promise) => promise.fromCitizenId === citizen.id && promise.toCitizenId === personInNeed.id && promise.status === "open")) results.push(candidate(`promise-food-${citizen.id}-${personInNeed.id}`, `Promise ${personInNeed.name} one future food`, { kind: "promise_item", targetCitizenId: personInNeed.id, resource: "berries", amount: 1, dueTick: context.tick + legacyDurationTicks(60) }));
  const grievanceTarget = others.find((other) => (citizen.socialRelationships?.[other.id]?.grievance ?? 0) >= 0.15);
  if (grievanceTarget) {
    if ((citizen.personality?.empathy ?? 0.5) + (citizen.values?.community ?? 0.5) >= 1.15) results.push(candidate(`forgive-${citizen.id}-${grievanceTarget.id}`, `Forgive ${grievanceTarget.name}`, { kind: "forgive", targetCitizenId: grievanceTarget.id }));
    if ((citizen.personality?.aggression ?? 0.5) + (citizen.emotions?.anger ?? 0) >= 1.05) results.push(candidate(`retaliate-${citizen.id}-${grievanceTarget.id}`, `Retaliate against ${grievanceTarget.name}`, { kind: "retaliate", targetCitizenId: grievanceTarget.id }));
  }
  const unclaimed = Object.values(context.physicalWorld?.resources ?? {}).find((node) => node.status === "available" && !context.physicalWorld?.claims[node.id]);
  if (unclaimed && (citizen.personality?.acquisitiveness ?? 0.5) >= 0.56) results.push(candidate(`claim-${unclaimed.id}-${citizen.id}`, `Claim ${unclaimed.assetId} #${unclaimed.objectUid}`, { kind: "claim_resource", nodeId: unclaimed.id }));
  const contested = Object.values(context.physicalWorld?.claims ?? {}).find((claim) => claim.ownerId !== citizen.id && !claim.challengedByIds.includes(citizen.id));
  if (contested && ((citizen.personality?.independence ?? 0.5) >= 0.62 || citizen.needs.hunger >= 0.75)) results.push(candidate(`challenge-${contested.nodeId}-${citizen.id}`, `Challenge the claim on ${contested.nodeId}`, { kind: "challenge_claim", nodeId: contested.nodeId, ownerId: contested.ownerId }));
  return results.slice(0, 18);
}

export type SocialIntent = Extract<ActionIntent, {
  kind: "request_item" | "share_item" | "steal_item" | "barter_item" | "rescue_person" | "offer_project_help" | "invite_project" | "teach_technique" | "warn_resource" | "conceal_resource" | "form_household" | "form_group" | "invite_group" | "adopt_group_system" | "leave_group" | "exclude_member" | "contribute_group_stock" | "promise_item" | "fulfill_promise" | "forgive" | "retaliate" | "claim_resource" | "challenge_claim";
}>;

export function socialIntentBlockReason(intent: SocialIntent, context: DecisionContext): string | undefined {
  const { citizen, citizens, physicalWorld } = context;
  if (citizen.physical?.alive === false) return "A dead citizen cannot begin a social action.";
  if ("targetCitizenId" in intent) {
    const target = citizens.find((other) => other.id === intent.targetCitizenId);
    if (!target || target.physical?.alive === false) return "The other person is no longer available.";
    if (target.id === citizen.id) return "A social action must involve another person.";
  }
  if (intent.kind === "share_item" && (citizen.inventory[intent.resource] ?? 0) < intent.amount) return "The promised item is no longer carried.";
  if (intent.kind === "steal_item") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if ((target.inventory[intent.resource] ?? 0) < intent.amount) return "The intended item is no longer in the other person's inventory.";
  }
  if (intent.kind === "rescue_person") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (context.tick - (target.physical?.lastRescuedAtTick ?? -1_000) < 12) return "Someone has already stabilized this person very recently.";
    if (target.physical?.incapacitatedSinceTick === undefined && (target.physical?.health ?? 1) > 0.16 && (target.physical?.injury ?? 0) < 0.82 && target.needs.fatigue < 0.98) return "The other person is no longer incapacitated.";
  }
  if (intent.kind === "barter_item") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if ((citizen.inventory[intent.offerResource] ?? 0) < intent.amount || (target.inventory[intent.requestResource] ?? 0) < intent.amount) return "One side no longer carries the proposed barter item.";
  }
  if (intent.kind === "offer_project_help" || intent.kind === "invite_project") {
    const project = physicalWorld?.projects[intent.projectId];
    if (!project || project.status === "complete" || project.status === "cancelled") return "That project no longer needs help.";
    if (intent.kind === "invite_project" && project.requestedByCitizenId !== citizen.id) return "Only the person who began this project may issue this invitation.";
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (intent.kind === "invite_project" && target.commitment?.status === "active") return "The invited person already has an active commitment.";
    if (intent.kind === "offer_project_help" && citizen.commitment?.status === "active") return "The volunteer already has an active commitment.";
  }
  if (intent.kind === "teach_technique") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (!citizen.knowledge?.learnedTechniques.includes(intent.technique)) return "The teacher no longer knows that technique.";
    if (target.knowledge?.learnedTechniques.includes(intent.technique)) return "The other person already knows that technique.";
  }
  if (intent.kind === "warn_resource") {
    if (!physicalWorld?.resources[intent.nodeId]) return "The remembered resource no longer exists.";
    if (!citizen.knowledge?.knownResources.includes(intent.nodeId)) return "The speaker has not personally learned where that resource is.";
  }
  if (intent.kind === "conceal_resource") {
    if (!physicalWorld?.resources[intent.nodeId] || !citizen.knowledge?.knownResources.includes(intent.nodeId)) return "The citizen no longer knows that resource location.";
  }
  if (intent.kind === "form_household") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (citizen.householdId || target.householdId) return "One of the people already belongs to a household.";
  }
  if (intent.kind === "form_group") {
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (citizen.groupIds?.length || target.groupIds?.length) return "One of the people already belongs to a persistent group.";
  }
  if (intent.kind === "invite_group") {
    const group = context.socialGroups?.[intent.groupId];
    const target = citizens.find((other) => other.id === intent.targetCitizenId)!;
    if (!group?.memberIds.includes(citizen.id)) return "The inviter no longer belongs to that group.";
    if (group.memberIds.includes(target.id) || target.groupIds?.length) return "The invited person already belongs to a persistent group.";
  }
  if (intent.kind === "adopt_group_system") {
    const group = context.socialGroups?.[intent.groupId];
    if (!group || !group.memberIds.includes(citizen.id)) return "The proposer no longer belongs to that group.";
    if (group.memberIds.length < 3) return "A persistent decision system requires at least three members.";
    if (group.decisionSystem !== "informal") return "This group already has a recognized decision system.";
    if (group.founderId !== citizen.id && group.leaderId !== citizen.id) return "Only the recognized founder or leader may open this founding discussion.";
    if (intent.system === "council" && group.memberIds.length < 5) return "A council requires at least five members.";
  }
  if (intent.kind === "leave_group") {
    const group = context.socialGroups?.[intent.groupId];
    if (!group || !group.memberIds.includes(citizen.id)) return "The citizen no longer belongs to that group.";
  }
  if (intent.kind === "exclude_member") {
    const group = context.socialGroups?.[intent.groupId];
    if (!group || !group.memberIds.includes(intent.targetCitizenId)) return "The intended person is no longer in that group.";
    if (group.founderId !== citizen.id && group.leaderId !== citizen.id) return "Only the group's recognized founder or leader may attempt exclusion.";
  }
  if (intent.kind === "contribute_group_stock") {
    const group = context.socialGroups?.[intent.groupId];
    if (!group?.memberIds.includes(citizen.id)) return "The citizen is not a member of that group.";
    if ((citizen.inventory[intent.resource] ?? 0) < intent.amount) return "The intended contribution is no longer carried.";
  }
  if (intent.kind === "promise_item" && intent.dueTick <= context.tick) return "A promise must have a future due time.";
  if (intent.kind === "fulfill_promise") {
    const promise = context.socialPromises?.[intent.promiseId];
    if (!promise || promise.status !== "open" || promise.fromCitizenId !== citizen.id || promise.toCitizenId !== intent.targetCitizenId) return "That promise is no longer open.";
    if ((citizen.inventory[promise.resource] ?? 0) < promise.amount) return "The promised item is not yet available.";
  }
  if (intent.kind === "forgive" || intent.kind === "retaliate") {
    const relation = citizen.socialRelationships?.[intent.targetCitizenId];
    if (!relation || relation.grievance < 0.1) return "There is no substantial grievance toward that person.";
  }
  if (intent.kind === "claim_resource") {
    const node = physicalWorld?.resources[intent.nodeId];
    if (!node || node.status !== "available") return "That resource can no longer be claimed.";
    if (physicalWorld?.claims[intent.nodeId]) return "Someone has already made a claim on that resource.";
  }
  if (intent.kind === "challenge_claim") {
    const claim = physicalWorld?.claims[intent.nodeId];
    if (!claim || claim.ownerId !== intent.ownerId) return "The claim being challenged no longer exists.";
    if (claim.ownerId === citizen.id) return "A citizen cannot challenge their own claim.";
    if (claim.challengedByIds.includes(citizen.id)) return "This challenge has already been made.";
  }
  return undefined;
}

function relationship(from: CitizenState, to: CitizenState) {
  from.socialRelationships ??= {};
  return from.socialRelationships[to.id] ??= {
    trust: from.relationships[to.id] ?? 0.5,
    affection: 0.5,
    fear: 0,
    respect: 0.5,
    debt: 0,
    grievance: 0,
  };
}

export function advanceSocialWorld(
  promises: Record<string, SocialPromiseState>,
  citizensById: Record<number, CitizenState>,
  tick: number,
  day: number,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (const promise of Object.values(promises).sort((left, right) => left.id.localeCompare(right.id))) {
    if (promise.status !== "open" || promise.dueTick >= tick) continue;
    promise.status = "broken";
    promise.resolvedAtTick = tick;
    const promisor = citizensById[promise.fromCitizenId];
    const recipient = citizensById[promise.toCitizenId];
    if (promisor && recipient) {
      const view = relationship(recipient, promisor);
      view.trust = Math.max(0, view.trust - 0.16);
      view.respect = Math.max(0, view.respect - 0.08);
      view.grievance = Math.min(1, view.grievance + 0.22);
      recipient.relationships[promisor.id] = view.trust;
      if (recipient.emotions) {
        recipient.emotions.resentment = Math.min(1, recipient.emotions.resentment + 0.16);
        recipient.emotions.anger = Math.min(1, recipient.emotions.anger + 0.08);
      }
      recipient.memories = [{
        id: `memory-broken-promise-${tick}-${promise.id}`,
        tick,
        text: `${promisor.name} broke a promise to give me ${promise.amount} ${promise.resource}.`,
        tone: "negative" as const,
        subjectCitizenId: promisor.id,
        salience: 0.96,
        expiresAtTick: tick + legacyDurationTicks(1_400),
      }, ...recipient.memories].slice(0, 8);
    }
    events.push({
      id: `event-broken-promise-${tick}-${promise.id}`,
      tick,
      day,
      category: "social",
      title: `${promisor?.name ?? "Someone"} breaks a promise`,
      detail: `${promise.amount} ${promise.resource} was not delivered to ${recipient?.name ?? "the recipient"} by the agreed time. Trust fell and a grievance formed.`,
      citizenIds: [promise.fromCitizenId, promise.toCitizenId],
    });
  }
  return events;
}

export function assertSocialWorldInvariants(
  groups: Record<string, SocialGroupState>,
  promises: Record<string, SocialPromiseState>,
  citizensById: Record<number, CitizenState>,
) {
  for (const [key, group] of Object.entries(groups)) {
    if (key !== group.id) throw new Error(`Social group key ${key} does not match id ${group.id}.`);
    if (!citizensById[group.founderId]) throw new Error(`Social group ${group.id} has an invalid founder.`);
    if (group.memberIds.length < 2 || new Set(group.memberIds).size !== group.memberIds.length) throw new Error(`Social group ${group.id} has invalid membership.`);
    for (const memberId of group.memberIds) {
      const member = citizensById[memberId];
      if (!member || !(member.groupIds ?? []).includes(group.id)) throw new Error(`Social group ${group.id} membership is not symmetric for citizen ${memberId}.`);
    }
    if (group.leaderId !== undefined && !group.memberIds.includes(group.leaderId)) throw new Error(`Social group ${group.id} has a leader outside its membership.`);
    for (const [resource, amount] of Object.entries(group.sharedInventory)) {
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`Social group ${group.id} has invalid ${resource} inventory.`);
    }
  }
  for (const citizen of Object.values(citizensById)) {
    for (const groupId of citizen.groupIds ?? []) if (!groups[groupId]?.memberIds.includes(citizen.id)) throw new Error(`Citizen ${citizen.id} references a group without symmetric membership.`);
  }
  for (const [key, promise] of Object.entries(promises)) {
    if (key !== promise.id) throw new Error(`Social promise key ${key} does not match id ${promise.id}.`);
    if (!citizensById[promise.fromCitizenId] || !citizensById[promise.toCitizenId] || promise.fromCitizenId === promise.toCitizenId) throw new Error(`Social promise ${promise.id} has invalid participants.`);
    if (!Number.isFinite(promise.amount) || promise.amount <= 0 || promise.dueTick < promise.promisedAtTick) throw new Error(`Social promise ${promise.id} has invalid terms.`);
    if (promise.status === "open" && promise.resolvedAtTick !== undefined) throw new Error(`Open social promise ${promise.id} is already resolved.`);
    if (promise.status !== "open" && promise.resolvedAtTick === undefined) throw new Error(`Resolved social promise ${promise.id} lacks a resolution tick.`);
  }
}
