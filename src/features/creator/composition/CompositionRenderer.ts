import type { LegacyWorldStatus } from "../../../types/legacy";
import type { RecordingLayout } from "./layouts";

export interface CompositionOverlays {
  clock: boolean;
  events: boolean;
  decisions: boolean;
  statistics: boolean;
}

export class CompositionRenderer {
  private frame = 0;
  private disposed = false;

  constructor(
    private readonly output: HTMLCanvasElement,
    private readonly source: HTMLCanvasElement,
    private layout: RecordingLayout,
    private overlays: CompositionOverlays,
    private readonly getStatus: () => LegacyWorldStatus | null,
  ) {
    this.resize();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }

  update(layout: RecordingLayout, overlays: CompositionOverlays) {
    this.layout = layout;
    this.overlays = overlays;
    this.resize();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
  }

  private resize() {
    if (this.output.width !== this.layout.width) this.output.width = this.layout.width;
    if (this.output.height !== this.layout.height) this.output.height = this.layout.height;
  }

  private loop() {
    if (this.disposed) return;
    this.draw();
    this.frame = requestAnimationFrame(this.loop);
  }

  private draw() {
    const context = this.output.getContext("2d");
    if (!context || !this.source.width || !this.source.height) return;
    const { width, height } = this.output;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#111a15";
    context.fillRect(0, 0, width, height);

    const sourceRatio = this.source.width / this.source.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = this.source.width;
    let sh = this.source.height;
    if (sourceRatio > targetRatio) {
      sw = this.source.height * targetRatio;
      sx = (this.source.width - sw) / 2;
    } else {
      sh = this.source.width / targetRatio;
      sy = (this.source.height - sh) / 2;
    }
    context.drawImage(this.source, sx, sy, sw, sh, 0, 0, width, height);

    const status = this.getStatus();
    if (!status) return;
    const unit = Math.max(1, width / 1280);
    if (this.overlays.clock || this.layout.id === "documentary") this.drawClock(context, status, unit);
    if (this.overlays.events || this.layout.id === "documentary" || this.layout.id === "square") this.drawEvents(context, status, unit);
    if (this.overlays.decisions || this.layout.id === "decision") this.drawDecision(context, status, unit);
    if (this.overlays.statistics || this.layout.id === "documentary") this.drawStatistics(context, status, unit);
  }

  private panel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    context.fillStyle = "rgba(251,246,236,.94)";
    context.strokeStyle = "rgba(194,168,119,.88)";
    context.lineWidth = Math.max(1, radius * .08);
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
    context.stroke();
  }

  private drawClock(context: CanvasRenderingContext2D, status: LegacyWorldStatus, unit: number) {
    const x = 28 * unit;
    const y = 26 * unit;
    const width = 210 * unit;
    const height = 72 * unit;
    this.panel(context, x, y, width, height, 18 * unit);
    context.fillStyle = "#2a1f16";
    context.font = `800 ${30 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillText(status.clock, x + 16 * unit, y + 33 * unit);
    context.font = `700 ${11 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillStyle = "#7a6657";
    context.fillText(`${status.phase} · Day ${status.day}`, x + 16 * unit, y + 54 * unit);
  }

  private drawEvents(context: CanvasRenderingContext2D, status: LegacyWorldStatus, unit: number) {
    const entries = (status.diary ?? []).slice(0, this.layout.aspect === "9:16" ? 2 : 1);
    if (!entries.length) return;
    const margin = 28 * unit;
    const width = this.output.width - margin * 2;
    const height = (this.layout.aspect === "9:16" ? 132 : 76) * unit;
    const y = this.output.height - height - margin;
    this.panel(context, margin, y, width, height, 18 * unit);
    entries.forEach((entry, index) => {
      const rowY = y + (24 + index * 48) * unit;
      context.font = `700 ${10 * unit}px ui-rounded, system-ui, sans-serif`;
      context.fillStyle = "#7a6657";
      context.fillText(entry.when, margin + 16 * unit, rowY);
      context.font = `700 ${14 * unit}px ui-rounded, system-ui, sans-serif`;
      context.fillStyle = "#2a1f16";
      context.fillText(entry.text.slice(0, this.layout.aspect === "9:16" ? 58 : 110), margin + 80 * unit, rowY);
    });
  }

  private drawDecision(context: CanvasRenderingContext2D, status: LegacyWorldStatus, unit: number) {
    const selection = status.sel;
    if (!selection || selection.type !== "villager") return;
    const wide = this.layout.aspect === "16:9";
    const width = (wide ? 330 : 520) * unit;
    const height = 154 * unit;
    const x = wide ? this.output.width - width - 28 * unit : 28 * unit;
    const y = wide ? 26 * unit : this.output.height - height - 180 * unit;
    this.panel(context, x, y, width, height, 18 * unit);
    context.fillStyle = "#248a7e";
    context.fillRect(x, y, 8 * unit, height);
    context.fillStyle = "#7a6657";
    context.font = `800 ${10 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillText("MOCK DECISION · VISUAL ENGINE", x + 22 * unit, y + 29 * unit);
    context.fillStyle = "#2a1f16";
    context.font = `800 ${20 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillText(selection.title, x + 22 * unit, y + 58 * unit);
    context.font = `700 ${13 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillText(selection.activity.slice(0, 48), x + 22 * unit, y + 86 * unit);
    context.fillStyle = "#5a463a";
    context.font = `600 ${11 * unit}px ui-rounded, system-ui, sans-serif`;
    context.fillText("Structured heuristic trace arrives with the deterministic provider.", x + 22 * unit, y + 117 * unit);
  }

  private drawStatistics(context: CanvasRenderingContext2D, status: LegacyWorldStatus, unit: number) {
    const x = 28 * unit;
    const y = 112 * unit;
    const width = 210 * unit;
    const height = 104 * unit;
    this.panel(context, x, y, width, height, 16 * unit);
    const rows = [["Population", status.pop], ["Food", (status.stock.wheat ?? 0) + (status.stock.fish ?? 0) + (status.stock.bread ?? 0)], ["Wood", status.stock.wood ?? 0]];
    rows.forEach(([label, value], index) => {
      const rowY = y + (25 + index * 27) * unit;
      context.fillStyle = "#7a6657";
      context.font = `700 ${10 * unit}px ui-rounded, system-ui, sans-serif`;
      context.fillText(String(label), x + 14 * unit, rowY);
      context.fillStyle = "#2a1f16";
      context.font = `800 ${14 * unit}px ui-rounded, system-ui, sans-serif`;
      context.textAlign = "right";
      context.fillText(String(value), x + width - 14 * unit, rowY);
      context.textAlign = "left";
    });
  }
}
