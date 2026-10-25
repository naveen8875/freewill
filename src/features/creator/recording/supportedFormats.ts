export const RECORDING_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E"',
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function selectSupportedMimeType(
  isSupported: (mimeType: string) => boolean,
  candidates: readonly string[] = RECORDING_MIME_CANDIDATES,
) {
  return candidates.find((mimeType) => isSupported(mimeType)) ?? "";
}

export function extensionForMimeType(mimeType: string) {
  return mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
}
