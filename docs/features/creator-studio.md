# freewill — Creator and Recording Studio

> Implementation note (2026-10-24): the composition canvas, five layouts, three aspect ratios, 24/30/60 FPS selection, overlay controls, MediaRecorder negotiation, start/stop timer, preview, and honest-format download are working. A browser verification produced a 7-second 5.0 MB MP4 where AVC capture was supported.

## Product goal

Creator mode turns a running civilization into a clean, intentional video composition without changing simulation rules. Recording is a presentation subsystem: it consumes the same renderer snapshots, event stream, decision history, metrics, and camera controls as the application.

The core workflow is:

1. open a running or paused world;
2. choose a layout and output settings;
3. select a camera target or manual framing;
4. enable optional event, decision, clock, and statistic overlays;
5. start recording through an explicit user action;
6. stop, preview, download, or discard the clip.

## Capture architecture

Canvas capture does not include DOM overlays. The studio therefore uses a dedicated **composition canvas**:

```text
world canvas ──────┐
                   ├─► CompositionRenderer ─► capture canvas ─► captureStream()
structured events ─┤                                │
decision read model┤                                └─► MediaRecorder ─► Blob
metrics/clock ─────┘
```

At each composition frame:

1. draw the cropped/scaled world canvas into the output rectangle;
2. draw safe-area-aware branded panels from structured overlay data;
3. render the recording indicator only in the controller UI, not in the exported frame;
4. allow the canvas capture track to sample the completed frame.

This produces deterministic layout and avoids requesting screen-capture permission for the normal workflow. The canvas must remain origin-clean; cross-origin images without appropriate CORS would prevent capture.

An optional “capture this tab/window” fallback may use `getDisplayMedia`, but only after an explicit click. The browser prompts every time and chooses the shared surface; the application cannot silently preselect it.

## Recording presets

| Preset | Aspect | Default output | Composition |
| --- | --- | --- | --- |
| Cinematic World | 16:9 | 1280×720, 30 fps | Full world, optional small day counter |
| AI Decision Showcase | 16:9 | 1280×720, 30 fps | World at left/center, selected NPC decision card at right |
| Civilization Documentary | 16:9 | 1920×1080 or 1280×720, 30 fps | World, day/chapter, key event strip, three compact metrics |
| Vertical Social Clip | 9:16 | 1080×1920 or 720×1280, 30 fps | Portrait crop, follow camera, decision/event card in lower safe area |
| Square Chronicle | 1:1 | 1080×1080, 30 fps | Centered world with bottom chronicle strip |

Resolution options are limited by device capability and memory. The UI estimates output cost and recommends 720p when the live renderer is already near its frame budget.

## Browser format policy

At runtime, test formats in preference order with `MediaRecorder.isTypeSupported()` and construct the recorder only with a confirmed type. A reasonable candidate order is:

1. `video/mp4;codecs=avc1.42E01E` where supported;
2. `video/webm;codecs=vp9`;
3. `video/webm;codecs=vp8`;
4. `video/webm`;
5. browser-selected default as the final supported fallback.

The download extension and UI label come from `recorder.mimeType`, not from a desired preset. The product must not promise MP4 on browsers that cannot record it. WebM is the expected cross-browser baseline for the first release; no client-side transcoder is included initially.

Official platform references:

- [`HTMLCanvasElement.captureStream()` specification](https://www.w3.org/TR/mediacapture-fromelement/#dom-htmlcanvaselement-capturestream)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [MediaRecorder constructor and MIME support](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder)
- [`getDisplayMedia()` permissions and user activation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

## UI layout

Creator mode removes the builder rail and ordinary inspector. It adds a quiet control dock outside the capture-safe area:

```text
┌──────────────────────────────────────────────────────────────┐
│  capture composition (safe guides optional)                  │
│                                                              │
│           living world              selected overlay         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Layout · Size · 30fps · Camera · Overlays    ● Start record │
└──────────────────────────────────────────────────────────────┘
```

While recording, controls collapse to duration, stop, and a clear recording-state announcement. Escape does not silently discard a recording; it opens a stop confirmation or stops according to the selected safety preference.

## State and modules

```text
apps/web/src/features/creator/
  CreatorStudio.tsx
  RecordingControls.tsx
  RecordingPreview.tsx
  PresetPicker.tsx
  OverlayControls.tsx
  useRecordingSession.ts
  composition/
    CompositionRenderer.ts
    layouts.ts
    drawEventOverlay.ts
    drawDecisionOverlay.ts
    drawMetricsOverlay.ts
  recording/
    MediaRecorderService.ts
    supportedFormats.ts
    downloadRecording.ts
```

`MediaRecorderService` owns chunks, recorder events, stream-track cleanup, duration, MIME type, and error handling. `CompositionRenderer` owns the capture canvas and subscribes to presentation read models. Neither imports or mutates simulation systems.

## Failure and privacy behavior

- Recording starts only from a visible user action.
- Stop all tracks and revoke previous object URLs when a session is discarded/replaced.
- Keep completed blobs in memory until download; do not silently persist large videos in IndexedDB.
- Warn before navigating away during an active recording.
- Surface unsupported capture/recorder APIs before the user configures a session.
- If encoding fails, preserve available chunks where the browser produced a playable blob and report the actual type.
- Full-screen/tab capture requires an additional browser permission explanation and remains separate from canvas composition.
- No microphone, camera, or system audio permission is requested in the initial release.

## Performance

- Compose at the selected frame rate, not every simulation tick.
- Reuse pre-rendered overlay panels and only redraw changed text/metrics.
- Avoid reading pixels back from the world canvas.
- Use `drawImage` into the composition canvas and let `captureStream` produce its video track.
- Monitor dropped composition frames and show a warning when actual capture falls materially below target.
- Default to 30 fps; 60 fps is opt-in and disabled when the browser/device cannot sustain it.

## Verification

Automated tests:

- format selection chooses only a supported MIME type;
- each preset computes correct output and safe rectangles;
- overlay toggles affect the capture canvas rather than only DOM;
- recorder lifecycle stops tracks and revokes object URLs;
- world and decision data are read-only inputs.

Browser tests with a short deterministic world:

- start from a click, record 3–5 seconds, stop, create a non-empty blob;
- preview metadata and video duration are present;
- download filename matches the actual MIME type;
- landscape, portrait, and square output report expected dimensions;
- event and decision overlays are visible in captured frames;
- camera follow remains active during recording;
- simulation can pause/resume independently;
- unsupported MP4 is not offered as MP4.

## Deferred features

- replay-based offline rendering;
- timeline trimming and clip concatenation;
- audio/music mixing;
- in-browser transcoding;
- automatic highlight detection;
- cloud rendering/upload;
- caption generation.

These can build on recorded replay/events without changing the core simulation or decision policy.
