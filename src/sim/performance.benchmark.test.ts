import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";

const enabled = process.env.RUN_FREEWILL_BENCHMARKS === "1";

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))];
}

function citizens(count: number) {
  const jobs = ["farmer", "builder", "woodcutter", "fisher", "miner", "smith"];
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Citizen ${index + 1}`, job: jobs[index % jobs.length] }));
}

describe.runIf(enabled)("retained simulation benchmark", () => {
  it("measures the 50/200/500/1000 citizen matrix and a 30-day soak", async () => {
    const rows: Array<Record<string, number>> = [];
    for (const population of [50, 200, 500, 1_000]) {
      const simulation = new MockSimulation(2026, citizens(population), { wheat: 200, fish: 50, wood: 300, stone: 200, ore: 20 });
      const samples: number[] = [];
      for (let tick = 0; tick < 30; tick += 1) {
        const start = performance.now();
        await simulation.step(1 + Math.floor(tick / 12));
        samples.push(performance.now() - start);
      }
      const snapshot = simulation.getSnapshot();
      const encoded = JSON.stringify(snapshot);
      const restoreStart = performance.now();
      const restored = new MockSimulation(2026, [], {}, JSON.parse(encoded));
      rows.push({ population, p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), p99: percentile(samples, 0.99), saveBytes: encoded.length, restoreMs: performance.now() - restoreStart });
      restored.destroy();
      simulation.destroy();
    }
    const marketCitizens = citizens(50);
    const marketSeedSimulation = new MockSimulation(2027, marketCitizens, { wheat: 200, fish: 50, bread: 50, wood: 300, stone: 200, ore: 20 }, undefined, undefined, undefined, undefined, { societyGoal: "market-economy" });
    const marketSeed = marketSeedSimulation.getSnapshot();
    marketSeedSimulation.destroy();
    marketSeed.civilizationGoal.stage = "active-market";
    for (const milestone of marketSeed.civilizationGoal.milestones) if (["charter", "currency", "property", "business"].includes(milestone.id)) milestone.completedAtTick = 0;
    marketSeed.economy.charter = { id: "benchmark-charter", proposerId: 1, supporterIds: marketCitizens.map((citizen) => citizen.id), opponentIds: [], status: "adopted", createdAtTick: 0, resolvedAtTick: 0 };
    marketSeed.politics.proposals["benchmark-charter"] = {
      id: "benchmark-charter",
      policyId: "market-charter",
      sponsorId: 1,
      eligibleVoterIds: marketCitizens.map((citizen) => citizen.id),
      ballots: Object.fromEntries(marketCitizens.map((citizen) => [citizen.id, { citizenId: citizen.id, choice: "support" as const, castAtTick: 0, decisionId: `benchmark-ballot-${citizen.id}` }])),
      status: "adopted",
      createdAtTick: 0,
      resolvedAtTick: 0,
      tally: { support: marketCitizens.length, oppose: 0, abstain: 0 },
    };
    marketSeed.politics.laws["market-charter"] = { policyId: "market-charter", proposalId: "benchmark-charter", enactedAtTick: 0, support: marketCitizens.length, oppose: 0 };
    marketSeed.politics.activeProposalId = undefined;
    marketSeed.economy.policies = { privateProperty: true, currency: true, contracts: true, taxRate: 0, publicFoodReserve: false };
    marketSeed.economy.wallets = Object.fromEntries(marketCitizens.map((citizen) => [citizen.id, 20]));
    marketSeed.economy.moneySupply = marketCitizens.length * 20;
    marketSeed.economy.transactions = marketCitizens.map((citizen) => ({ id: `transaction-founding-0-${citizen.id}`, tick: 0, kind: "founding-allocation" as const, fromId: "settlement:mint", toId: `citizen:${citizen.id}`, money: 20 }));
    for (const owner of marketCitizens.slice(0, 10)) {
      const id = `benchmark-business-${owner.id}`;
      marketSeed.economy.wallets[owner.id] -= 5;
      marketSeed.economy.businesses[id] = { id, name: `${owner.name}'s Workshop`, kind: owner.job, ownerId: owner.id, capital: 5, inventory: { wheat: 3 }, employeeIds: [], organization: "sole-proprietorship", facilityObjectUids: [], blockers: [], productionRuns: 0, createdAtTick: 0 };
      marketSeed.economy.ownership.push({ assetId: id, assetKind: "business", ownerId: owner.id, acquiredAtTick: 0 });
      marketSeed.economy.transactions.unshift({ id: `transaction-investment-0-${owner.id}`, tick: 0, kind: "investment", fromId: `citizen:${owner.id}`, toId: `business:${id}`, money: 5 });
    }
    for (const owner of marketCitizens.slice(0, 5)) {
      const businessId = `benchmark-business-${owner.id}`;
      const business = marketSeed.economy.businesses[businessId];
      const offerId = `benchmark-offer-${owner.id}`;
      business.inventory.wheat -= 1;
      marketSeed.economy.offers[offerId] = { id: offerId, sellerId: owner.id, businessId, sourceOwnerType: "business", sourceOwnerId: businessId, resource: "wheat", amountRemaining: 1, unitPrice: 3, status: "open", createdAtTick: 0, expiresAtTick: 240 };
      const workerId = owner.id + 10;
      const contractId = `benchmark-contract-${owner.id}-${workerId}`;
      business.capital -= 3;
      marketSeed.economy.contracts[contractId] = { id: contractId, businessId, employerId: owner.id, workerId, wage: 3, escrowedWage: 3, status: "offered", createdAtTick: 0, expiresAtTick: 240 };
    }
    const initialMarketTransactions = marketSeed.economy.transactions.length;
    marketSeed.checkpoints = [];
    const market = new MockSimulation(2027, marketCitizens, {}, marketSeed);
    const marketSamples: number[] = [];
    for (let tick = 0; tick < 360; tick += 1) {
      const start = performance.now();
      await market.step(1 + Math.floor(tick / 12));
      marketSamples.push(performance.now() - start);
    }
    const marketSnapshot = market.getSnapshot();
    const marketRow = {
      population: 50,
      ticks: 360,
      p50: percentile(marketSamples, 0.5),
      p95: percentile(marketSamples, 0.95),
      p99: percentile(marketSamples, 0.99),
      saveBytes: JSON.stringify(marketSnapshot).length,
      decisions: marketSnapshot.decisions.length,
      transactions: marketSnapshot.economy.transactions.length,
      charterStatus: marketSnapshot.economy.charter?.status ?? "missing",
      charterSupporters: marketSnapshot.economy.charter?.supporterIds.length ?? 0,
      trades: marketSnapshot.economy.transactions.filter((transaction) => transaction.kind === "trade").length,
      businesses: Object.keys(marketSnapshot.economy.businesses).length,
      offers: Object.keys(marketSnapshot.economy.offers).length,
      contracts: Object.keys(marketSnapshot.economy.contracts).length,
    };
    const beforeHeap = process.memoryUsage().heapUsed;
    const soak = new MockSimulation(3030, citizens(50), { wheat: 200, wood: 300, stone: 200 });
    for (let tick = 0; tick < 360; tick += 1) await soak.step(1 + Math.floor(tick / 12));
    const afterHeap = process.memoryUsage().heapUsed;
    const soakSnapshot = soak.getSnapshot();
    market.destroy();
    soak.destroy();
    console.info("FREEWILL_BENCHMARK", JSON.stringify({ rows, market: marketRow, soak: { ticks: 360, decisions: soakSnapshot.decisions.length, events: soakSnapshot.events.length, checkpoints: soakSnapshot.checkpoints.length, heapDeltaBytes: afterHeap - beforeHeap } }));
    expect(rows[0].p95).toBeLessThan(8);
    expect(rows[1].p95).toBeLessThan(16);
    // The developed-market fixture carries businesses, offers, contracts,
    // ballots and 360 ticks of inspectable history. It is a compatibility
    // stress case; the primary 50–200 wilderness budgets remain 8/16 ms.
    expect(marketRow.p95).toBeLessThan(30);
    expect(marketSnapshot.economy.charter?.status).toBe("adopted");
    expect(marketSnapshot.economy.transactions.length).toBeGreaterThan(initialMarketTransactions);
    expect(soakSnapshot.checkpoints.length).toBeLessThanOrEqual(64);
  }, 60_000);
});
