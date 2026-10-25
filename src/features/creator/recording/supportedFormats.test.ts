import { describe, expect, it } from "vitest";
import { extensionForMimeType, selectSupportedMimeType } from "./supportedFormats";

describe("recording format selection", () => {
  it("uses the first format the browser reports as supported", () => {
    const supported = new Set(["video/webm;codecs=vp8", "video/webm"]);
    expect(selectSupportedMimeType((type) => supported.has(type))).toBe("video/webm;codecs=vp8");
  });

  it("returns an empty string when the browser must choose", () => {
    expect(selectSupportedMimeType(() => false)).toBe("");
  });

  it("derives the honest file extension from the recorder type", () => {
    expect(extensionForMimeType('video/mp4;codecs="avc1"')).toBe("mp4");
    expect(extensionForMimeType("video/webm;codecs=vp9")).toBe("webm");
  });
});
