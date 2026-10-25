# Versioning and compatibility

Freewill versions several contracts independently:

- application release;
- world-document schema;
- database schema;
- environment implementation;
- observation vector;
- candidate features and action vocabulary;
- reward function;
- brain checkpoint format.

A loader may migrate an old world document when an explicit tested migration exists. Replay verifies checkpoint hashes and refuses corrupted history. Brain and experiment comparisons must match the relevant environment, observation/action, and reward versions.

The current public release target is `v0.1.0-alpha`. The current headless environment is `freewill-sim-v7-integrity`. Alpha releases may introduce breaking changes, but those changes must be recorded in `CHANGELOG.md` and accompanied by migrations or clear incompatibility diagnostics.

