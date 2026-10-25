# Experimental integrity

Freewill is a game and an experiment. The interface can be playful; the evaluation must still be honest.

## Rules

- Record the exact environment, reward, observation, action-vocabulary, and brain-service versions.
- Separate training seeds from held-out validation seeds.
- Compare multiple replicates instead of selecting the most entertaining run.
- Keep provider failures, invalid responses, cancellations, and unreachable actions visible.
- Do not compare fitness values across incompatible reward or environment versions.
- Do not add a reward for a desired political, economic, or settlement outcome.
- Preserve failed, wasteful, antisocial, and fatal choices as valid experimental results.

## Current integrity gate

The `freewill-sim-v7-integrity` environment reports survival, physiological stability, action success, unreachable-action rate, collapse burden, rescues, renewable-food production, spoilage, and campfire fuel state. A held-out generation is not labeled scientifically clean when accepted unreachable actions are at or above one percent.

Social relief requires completed face-to-face behavior. Repeated collapses and death affect fitness even if a villager briefly recovers before the final tick.

See [Metrics and validation](../experiments/metrics-and-validation.md).

