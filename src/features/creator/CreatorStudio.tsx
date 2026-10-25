import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { CompositionRenderer, type CompositionOverlays } from "./composition/CompositionRenderer";
import { RECORDING_LAYOUTS, type RecordingLayoutId } from "./composition/layouts";
import { MediaRecorderService, type RecordingResult } from "./recording/MediaRecorderService";
import { extensionForMimeType } from "./recording/supportedFormats";

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CreatorStudio() {
  const renderer = useAppStore((state) => state.renderer);
  const setMode = useAppStore((state) => state.setMode);
  const setPanel = useAppStore((state) => state.setPanel);
  const [layoutId, setLayoutId] = useState<RecordingLayoutId>("cinematic");
  const [frameRate, setFrameRate] = useState<24 | 30 | 60>(30);
  const [overlays, setOverlays] = useState<CompositionOverlays>({ clock: true, events: false, decisions: false, statistics: false });
  const [isRecording, setIsRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeMimeType, setActiveMimeType] = useState("");
  const [result, setResult] = useState<(RecordingResult & { url: string }) | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const serviceRef = useRef(new MediaRecorderService());
  const compositionRef = useRef<CompositionRenderer | null>(null);
  const layout = useMemo(() => RECORDING_LAYOUTS.find((item) => item.id === layoutId) ?? RECORDING_LAYOUTS[0], [layoutId]);
  const supported = typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

  useEffect(() => {
    const output = canvasRef.current;
    if (!output || !renderer) return;
    compositionRef.current = new CompositionRenderer(output, renderer.canvas, layout, overlays, () => useAppStore.getState().status);
    return () => {
      compositionRef.current?.destroy();
      compositionRef.current = null;
    };
  }, [renderer]);

  useEffect(() => {
    compositionRef.current?.update(layout, overlays);
  }, [layout, overlays]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt), 200);
    return () => window.clearInterval(timer);
  }, [isRecording, startedAt]);

  useEffect(() => () => {
    serviceRef.current.cancel();
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result?.url]);

  const toggleOverlay = (key: keyof CompositionOverlays) => {
    setOverlays((current) => ({ ...current, [key]: !current[key] }));
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError("");
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    try {
      const mimeType = serviceRef.current.start(canvas, frameRate);
      const now = performance.now();
      setActiveMimeType(mimeType);
      setStartedAt(now);
      setElapsed(0);
      setIsRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recording could not start.");
    }
  };

  const stopRecording = async () => {
    try {
      const recording = await serviceRef.current.stop();
      const url = URL.createObjectURL(recording.blob);
      setResult({ ...recording, url });
      setElapsed(recording.durationMs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recording could not be finished.");
    } finally {
      setIsRecording(false);
    }
  };

  const close = () => {
    if (isRecording) return;
    setMode("observe");
    setPanel("worlds");
  };

  return (
    <aside className="creator-studio">
      <div className="creator-heading">
        <div><small>Creator mode</small><h2>Frame this little world</h2></div>
        <button onClick={close} disabled={isRecording} aria-label="Close creator mode">×</button>
      </div>

      <div className={`capture-preview aspect-${layout.aspect.replace(":", "-")}`}>
        <canvas ref={canvasRef} aria-label="Recording composition preview" />
        {isRecording ? <div className="recording-flag"><span /> REC {formatDuration(elapsed)}</div> : null}
      </div>

      <div className="creator-preview-note">
        <span className="record-dot" />
        <div><strong>{isRecording ? `Recording ${activeMimeType.split(";")[0]}` : "Composition preview"}</strong><small>The exported frame includes the canvas overlays shown here.</small></div>
      </div>

      <section>
        <h3>Layout</h3>
        <div className="layout-cards">
          {RECORDING_LAYOUTS.map((item) => (
            <button key={item.id} className={layoutId === item.id ? "is-active" : ""} onClick={() => setLayoutId(item.id)} disabled={isRecording}>
              <i className={`ratio ${item.aspect === "16:9" ? "ratio-wide" : item.aspect === "9:16" ? "ratio-tall" : "ratio-square"} ${item.id === "decision" ? "overlay" : ""}`} />
              <span>{item.name}</span><small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="creator-settings">
        <label><span>Output</span><output>{layout.width} × {layout.height}</output></label>
        <label><span>Frame rate</span><select value={frameRate} disabled={isRecording} onChange={(event) => setFrameRate(Number(event.target.value) as 24 | 30 | 60)}><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
        <label><span>Camera</span><select disabled={isRecording} defaultValue="manual"><option value="manual">Manual camera</option><option value="follow">Follow selection</option></select></label>
      </section>

      <section className="overlay-toggles">
        <h3>Overlays</h3>
        <div>
          {(Object.keys(overlays) as Array<keyof CompositionOverlays>).map((key) => (
            <label key={key}><input type="checkbox" checked={overlays[key]} disabled={isRecording} onChange={() => toggleOverlay(key)} /><span>{key}</span></label>
          ))}
        </div>
      </section>

      {error ? <p className="recording-error" role="alert">{error}</p> : null}
      {!supported ? <p className="creator-status">This browser does not expose canvas recording. Try a current Chromium, Firefox, or Safari release.</p> : null}

      {result ? (
        <section className="recording-result">
          <video src={result.url} controls playsInline />
          <div><strong>{formatDuration(result.durationMs)} clip</strong><small>{result.mimeType} · {(result.blob.size / 1024 / 1024).toFixed(1)} MB</small></div>
          <a href={result.url} download={`freewill-${layout.id}.${extensionForMimeType(result.mimeType)}`}>Download {extensionForMimeType(result.mimeType).toUpperCase()}</a>
        </section>
      ) : null}

      {isRecording ? <button className="record-action is-stopping" onClick={stopRecording}><span /> Stop and preview</button> : <button className="record-action" onClick={startRecording} disabled={!supported || !renderer}><span /> Start recording</button>}
    </aside>
  );
}
