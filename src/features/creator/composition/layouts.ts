export type RecordingLayoutId = "cinematic" | "decision" | "documentary" | "vertical" | "square";

export interface RecordingLayout {
  id: RecordingLayoutId;
  name: string;
  detail: string;
  aspect: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
}

export const RECORDING_LAYOUTS: RecordingLayout[] = [
  { id: "cinematic", name: "Cinematic world", detail: "16:9 · clean view", aspect: "16:9", width: 1280, height: 720 },
  { id: "decision", name: "Decision showcase", detail: "16:9 · NPC context", aspect: "16:9", width: 1280, height: 720 },
  { id: "documentary", name: "Civilization documentary", detail: "16:9 · events and pulse", aspect: "16:9", width: 1280, height: 720 },
  { id: "vertical", name: "Vertical social", detail: "9:16 · follow view", aspect: "9:16", width: 720, height: 1280 },
  { id: "square", name: "Square chronicle", detail: "1:1 · event strip", aspect: "1:1", width: 1080, height: 1080 },
];
