import type { QualityMode } from "./types";

/** Camera/voice quality changes that can preserve the existing audio transport. */
export function canRetuneQuality(pc: RTCPeerConnection, before: QualityMode, after: QualityMode,
  wanted: MediaStreamTrack[]): boolean {
  if (before === after || before === "audio" || after === "audio" ||
      pc.connectionState !== "connected" || pc.signalingState !== "stable") return false;
  const sent = pc.getSenders().map((s) => s.track).filter((t): t is MediaStreamTrack => !!t);
  return sent.length === wanted.length && sent.every((t) => wanted.includes(t));
}

const updates = new WeakMap<RTCPeerConnection, Promise<boolean>>();
export function applySenderQuality(pc: RTCPeerConnection, quality: QualityMode): Promise<boolean> {
  const previous = updates.get(pc) ?? Promise.resolve(true);
  const next = previous.catch(() => false).then(() => applyNow(pc, quality));
  updates.set(pc, next);
  return next;
}

async function applyNow(pc: RTCPeerConnection, quality: QualityMode): Promise<boolean> {
  let success = true;
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const audio = sender.track.kind === "audio";
    const bitrate = audio ? 32_000 : quality === "low" ? 250_000 : 600_000;
    const configure = (prioritize: boolean) => {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = bitrate;
      if (prioritize) Object.assign(parameters.encodings[0], {
        priority: audio ? "high" : "low", networkPriority: audio ? "high" : "low",
      });
      return sender.setParameters(parameters);
    };
    try { await configure(true); }
    catch {
      try { await configure(false); }
      catch (error) {
        success = false;
        console.warn("[stream-media] sender-parameters", error instanceof Error ? error.name : "Error");
      }
    }
  }
  return success;
}
