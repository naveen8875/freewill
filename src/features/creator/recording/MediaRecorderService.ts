import { selectSupportedMimeType } from "./supportedFormats";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class MediaRecorderService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  static supportedMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    return selectSupportedMimeType((type) => MediaRecorder.isTypeSupported(type));
  }

  static isSupported(canvas?: HTMLCanvasElement | null) {
    return typeof MediaRecorder !== "undefined" && Boolean(canvas?.captureStream);
  }

  start(canvas: HTMLCanvasElement, frameRate: number) {
    if (this.recorder?.state === "recording") throw new Error("A recording is already active.");
    if (!MediaRecorderService.isSupported(canvas)) throw new Error("Canvas recording is not supported by this browser.");

    const preferredMimeType = MediaRecorderService.supportedMimeType();
    this.stream = canvas.captureStream(frameRate);
    this.chunks = [];
    this.startedAt = performance.now();
    this.recorder = new MediaRecorder(this.stream, preferredMimeType ? {
      mimeType: preferredMimeType,
      videoBitsPerSecond: 8_000_000,
    } : { videoBitsPerSecond: 8_000_000 });
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(250);
    return this.recorder.mimeType || preferredMimeType || "video/webm";
  }

  stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.reject(new Error("No recording is active."));

    return new Promise((resolve, reject) => {
      const finish = () => {
        const mimeType = recorder.mimeType || "video/webm";
        const result = {
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
          durationMs: Math.max(0, performance.now() - this.startedAt),
        };
        this.cleanup();
        resolve(result);
      };
      recorder.addEventListener("stop", finish, { once: true });
      recorder.addEventListener("error", () => {
        this.cleanup();
        reject(new Error("The browser could not finish the recording."));
      }, { once: true });
      recorder.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.chunks = [];
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }
}
