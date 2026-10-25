# Villager brains and learning

Every villager uses the same action language and observation contract. Different traits, values, local knowledge, memories, recurrent state, and individual brain parameters can still produce different choices.

## During one life

The observation encoder converts the villager's current experience into a fixed-size numeric vector. Candidate features describe each legal action. A recurrent policy scores the candidates while carrying lifetime memory forward between decisions.

The policy does not replay a memorized training route. It receives a new observation and a new legal set every time it deliberates.

## Across generations

The first learning system uses neuroevolution:

1. Evaluate brains across several seeded episodes.
2. Aggregate their survival and general consequence metrics.
3. Keep selected parents.
4. Create descendants through recorded mutations.
5. Evaluate the new population.
6. Compare promising generations on separate held-out seeds.

Checkpoints store model weights, lineage, mutations, configuration, environment version, reward version, and metrics. A brain is not considered better merely because it had one lucky world.

The implementation contract is documented in [Local evolving brains](../providers/local-evolving-brains.md) and [Neuroevolution laboratory contract](../experiments/neuroevolution-contract.md).

