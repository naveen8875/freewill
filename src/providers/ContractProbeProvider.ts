type ProbeRequest = {
  requestId: string;
  candidates: ReadonlyArray<{ id: string; legal: boolean }>;
};

type ProbeDecision<CandidateId extends string> = {
  requestId: string;
  selectedCandidateId: CandidateId;
  provider: typeof CONTRACT_PROBE_PROVIDER;
  signals: { kind: "external"; evaluations: Array<{ candidateId: CandidateId; probability: number }>; responseModel: string };
};

export const CONTRACT_PROBE_PROVIDER = {
  kind: "test-delayed",
  id: "json-contract-probe",
  label: "JSON contract probe",
  version: "1",
} as const;

/**
 * Exercises the future server boundary without importing simulation code or
 * receiving a reference to mutable world state.
 */
export class ContractProbeProvider {
  readonly descriptor = CONTRACT_PROBE_PROVIDER;

  constructor(private readonly delayMs = 8, private readonly corruptResponse = false) {}

  async decide<Request extends ProbeRequest>(request: Request, signal: AbortSignal): Promise<ProbeDecision<Request["candidates"][number]["id"]>> {
    const wireRequest = JSON.stringify(request);
    await this.delay(signal);
    const decoded = JSON.parse(wireRequest) as Request;
    const legal = decoded.candidates.filter((candidate) => candidate.legal);
    if (!legal.length) throw new Error("Contract probe received no legal candidate.");
    const selected = legal[0].id as Request["candidates"][number]["id"];
    const response: ProbeDecision<typeof selected> = {
      requestId: this.corruptResponse ? `${decoded.requestId}-corrupt` : decoded.requestId,
      selectedCandidateId: selected,
      provider: this.descriptor,
      signals: {
        kind: "external",
        evaluations: legal.map((candidate, index) => ({ candidateId: candidate.id as typeof selected, probability: index === 0 ? 1 : 0 })),
        responseModel: "local-json-roundtrip",
      },
    };
    return JSON.parse(JSON.stringify(response)) as ProbeDecision<typeof selected>;
  }

  private delay(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Decision request was aborted.", "AbortError"));
        return;
      }
      const timeout = setTimeout(resolve, this.delayMs);
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new DOMException("Decision request was aborted.", "AbortError"));
      }, { once: true });
    });
  }
}
