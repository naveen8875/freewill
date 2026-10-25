import { useAppStore } from "../state/appStore";
import { setWorldTool } from "../state/worldCommands";
import type { WorldTool } from "../types/legacy";
import { PixelThumb } from "./PixelThumb";
import { redoBuilderMutation, undoBuilderMutation, useBuilderHistory } from "../state/builderHistory";

const TOOLS: Array<{ id: WorldTool; label: string; asset: string }> = [
  { id: "watch", label: "Watch", asset: "villager" },
  { id: "build", label: "Build", asset: "cottage" },
  { id: "plant", label: "Nature", asset: "oak" },
  { id: "terrain", label: "Terrain", asset: "tuft" },
  { id: "people", label: "Spawn", asset: "deer" },
  { id: "erase", label: "Erase", asset: "icon_bang" },
];

export function BottomDock() {
  const mode = useAppStore((state) => state.mode);
  const tool = useAppStore((state) => state.tool);
  const setMode = useAppStore((state) => state.setMode);
  const setPanel = useAppStore((state) => state.setPanel);
  const canUndo = useBuilderHistory((state) => state.past.length > 0);
  const canRedo = useBuilderHistory((state) => state.future.length > 0);
  const historicalTick = useAppStore((state) => state.historicalTick);

  if (mode === "creator") return null;

  return (
    <div className="bottom-dock" aria-label="World tools">
      {mode === "build" ? <button className="history-tool" disabled={!canUndo || historicalTick !== null} onClick={undoBuilderMutation} title="Undo last edit"><span>↶</span><small>Undo</small></button> : null}
      {mode === "build" ? <button className="history-tool" disabled={!canRedo || historicalTick !== null} onClick={redoBuilderMutation} title="Redo last edit"><span>↷</span><small>Redo</small></button> : null}
      {TOOLS.map((item) => (
        <button
          key={item.id}
          disabled={historicalTick !== null && item.id !== "watch"}
          className={tool === item.id ? "is-active" : ""}
          onClick={() => {
            setWorldTool(item.id);
            setMode(item.id === "watch" ? "observe" : "build");
            if (item.id !== "watch" && item.id !== "erase") setPanel("assets");
          }}
        >
          <PixelThumb asset={item.asset} scale={item.id === "watch" ? 3 : 2} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
