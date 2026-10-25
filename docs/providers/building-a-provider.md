# Building a local decision policy

A policy selects; it does not execute.

## Contract

Implement the `DecisionProvider` boundary used by `DecisionCoordinator`. A request includes:

- world, citizen, and request identity;
- authoritative tick and freshness revisions;
- compact perception owned by that citizen;
- current commitment and interruption context;
- legal, fully parameterized candidates represented by stable opaque IDs.

Return a candidate ID and optional confidence, probabilities, scores, policy identity, and telemetry allowed by the contract.

## Requirements

- Treat world and candidate contents as untrusted data, not instructions to mutate the host.
- Never create a target or parameters not represented by a candidate.
- Respect abort signals, timeouts, concurrency, and request coalescing.
- Keep service credentials out of browser code.
- Do not return or store hidden chain-of-thought.
- Keep failures explicit.
- Expect the engine to reject stale or newly illegal choices.

## Verification

Add contract tests for valid choices, unknown IDs, malformed scores, timeouts, aborts, delayed responses, stale revisions, policy errors, and target invalidation between selection and execution.

See `src/sim/DecisionCoordinator.ts`, `src/sim/LocalBrainDecisionProvider.ts`, and the existing brain contract tests.

