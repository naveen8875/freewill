import { create } from "zustand";
import type { WorldDocument } from "../persistence/worldDocument";
import { useAppStore } from "./appStore";
import { diffWorldDocuments } from "./editorCommands";

interface HistoryState {
  past: WorldDocument[];
  present: WorldDocument | null;
  future: WorldDocument[];
  lastMutationAt: number;
}

export const useBuilderHistory = create<HistoryState>(() => ({ past: [], present: null, future: [], lastMutationAt: 0 }));

function captureDocument() {
  const state = useAppStore.getState();
  if (!state.renderer) throw new Error("The world renderer is not ready.");
  return state.renderer.exportDocument({
    presetId: state.presetId,
    seed: state.seed,
    era: state.era,
    chapter: state.chapter,
    government: state.government,
    societyGoal: state.societyGoal,
    goalPrompt: state.goalPrompt,
    decisionMode: state.decisionMode,
    brainDeployment: state.brainDeployment ?? undefined,
    weather: state.weather,
    simulation: state.simulation,
  });
}

export function initializeBuilderHistory() {
  useBuilderHistory.setState({ past: [], present: captureDocument(), future: [], lastMutationAt: 0 });
}

export function recordBuilderMutation() {
  const current = useBuilderHistory.getState();
  useAppStore.getState().invalidateSimulation?.();
  const next = captureDocument();
  if (current.present) {
    const patches = diffWorldDocuments(current.present, next);
    if (patches.length) {
      next.editor.commandLog = [...next.editor.commandLog, {
        id: `canvas-edit-${next.editor.commandLog.length + 1}`,
        type: `legacy-${useAppStore.getState().tool}`,
        payload: { patches, inversePatches: patches.map((patch) => ({ path: patch.path, before: patch.after, after: patch.before })).reverse() },
      }].slice(-500);
      useAppStore.getState().renderer?.setEditorState(next.editor);
    }
  }
  const now = performance.now();
  const grouped = current.lastMutationAt > 0 && now - current.lastMutationAt < 180;
  useBuilderHistory.setState({
    past: grouped || !current.present ? current.past : [...current.past, current.present].slice(-40),
    present: next,
    future: [],
    lastMutationAt: now,
  });
}

function apply(document: WorldDocument) {
  const state = useAppStore.getState();
  state.renderer?.importDocument(document);
  state.invalidateSimulation?.();
  state.setStatus(state.renderer?.getStatus() ?? null);
}

export function undoBuilderMutation() {
  const current = useBuilderHistory.getState();
  const previous = current.past.at(-1);
  if (!previous || !current.present) return;
  useBuilderHistory.setState({ past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future], lastMutationAt: 0 });
  apply(previous);
}

export function redoBuilderMutation() {
  const current = useBuilderHistory.getState();
  const next = current.future[0];
  if (!next || !current.present) return;
  useBuilderHistory.setState({ past: [...current.past, current.present].slice(-40), present: next, future: current.future.slice(1), lastMutationAt: 0 });
  apply(next);
}
