# Running an experiment

## Start the stack

```bash
cp .env.example .env
docker compose up -d --build
```

Open the **Experiments** panel in the game. The recommended first public baseline is intentionally small:

- 20 villagers;
- 30 simulated days;
- multiple training seeds;
- separate held-out seeds;
- evolutionary mutation and selection;
- CPU-only local execution.

Start with one generation as a smoke test. Confirm that episodes advance, checkpoints appear, the observatory can open, and interruption recovery works before launching a longer run.

## Record with every result

- Experiment and generation IDs.
- Environment and reward versions.
- Population, elite count, mutation configuration, days, seeds, and replicates.
- Machine and thread count when reporting runtime.
- Training and held-out metrics.
- Whether the run was resumed or interrupted.

## Interpret carefully

Do not select the funniest episode and call the generation improved. Compare the same held-out seed/replicate pairs, inspect failure metrics, and retain the parent baseline. Old generations remain useful historical artifacts but are not directly comparable after a contract or reward change.

See [Metrics and validation](metrics-and-validation.md).

