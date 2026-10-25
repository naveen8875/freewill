import { useAppStore, type PanelId } from "../state/appStore";

const ITEMS: Array<{ id: PanelId; label: string; glyph: string }> = [
  { id: "worlds", label: "World", glyph: "◉" },
  { id: "people", label: "People", glyph: "♟" },
  { id: "relationships", label: "Relations", glyph: "⌁" },
  { id: "civilization", label: "Society", glyph: "⌂" },
  { id: "chronicle", label: "Chronicle", glyph: "≋" },
  { id: "decisions", label: "Decisions", glyph: "◇" },
  { id: "experiments", label: "Experiments", glyph: "⌬" },
];

export function SideNav() {
  const panel = useAppStore((state) => state.panel);
  const setPanel = useAppStore((state) => state.setPanel);
  return (
    <nav className="side-nav" aria-label="World workspace">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={panel === item.id ? "is-active" : ""}
          onClick={() => setPanel(item.id)}
          aria-label={item.label}
          title={item.label}
        >
          <span>{item.glyph}</span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
