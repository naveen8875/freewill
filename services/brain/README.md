# Freewill brain service

Local phase-one neural decision and evolutionary service. It binds to loopback,
scores only candidates supplied by the authoritative TypeScript engine, and
stores safe tensor checkpoints under `FREEWILL_BRAIN_DATA`.

```bash
cd services/brain
python3 -m uvicorn freewill_brain.api:app --host 127.0.0.1 --port 8008
```

The service does not run or mutate the world simulation. It receives versioned
numeric observations and exact legal candidates, returning one candidate ID.

