# Evolution observatory

The observatory is a read-only debugging view for running and completed experiments.

Open an experiment in the main **Experiments** panel and choose **Open evolution observatory**.

## Live view

- Switch between episodes and citizens.
- Watch real citizen positions, routes, needs, inventory, groups, and world events.
- Inspect the brain's genuine scored legal candidates.
- See commitments, memories, decisions, and action outcomes.

## Replay

Recorded field checkpoints can be played, paused, single-stepped, and scrubbed. Replay does not call a brain or alter the experiment. It reconstructs historical state from saved recorder frames.

## What scores mean

Candidate scores are policy outputs over the currently legal action set. They are not hidden chain-of-thought, English reasoning, or calibrated probabilities unless the provider contract explicitly supplies probabilities. The interface labels heuristic contributions and provider metadata honestly.

