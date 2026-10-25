# Metrics and validation

Freewill evaluates general survival and consequence signals rather than rewarding a particular civilization.

## Episode metrics

| Metric | Meaning |
| --- | --- |
| Survival | Fraction alive at the end and survival time across citizens |
| Physiological stability | Final body state adjusted for repeated collapse burden |
| Action success | Completed actions relative to attempted actions |
| Unreachable actions | Accepted choices that could not reach their required target |
| Critical interruptions | Commitments broken by urgent survival needs |
| Collapses and rescues | Severe failure and social recovery events |
| Renewable food | Food obtained from repeatable world systems |
| Spoilage | Produced or stored food lost over time |
| Campfire fuel | Whether built campfires can actually remain useful |
| Social state | Loneliness, relationships, and completed face-to-face behavior |

Death carries a substantially larger negative lifetime signal than an ordinary canceled action. Repeated collapses count even when final needs temporarily recover.

## Held-out evaluation

Training seeds influence selection. Held-out seeds do not. A generation comparison should use at least two held-out seeds and two replicates, pair the same worlds between parent and descendant, and report both improvement and regressions.

The current integrity verdict also requires accepted unreachable actions below one percent. This prevents a policy from appearing successful while repeatedly choosing actions the engine cannot execute.

Metrics are diagnostic. No single number proves intelligence, generality, or consciousness.

