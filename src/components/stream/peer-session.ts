/** Each negotiation owns its ICE queue. Late messages cannot mutate a replacement. */
export class PeerSession {
  private queue: RTCIceCandidateInit[] = [];
  private pending = Promise.resolve();
  private closed = false;
  constructor(readonly id: string, readonly pc: RTCPeerConnection,
    private report: (operation: string, error: unknown) => void) {}

  addIce(candidate: RTCIceCandidateInit) {
    if (this.closed) return;
    if (!this.pc.remoteDescription) {
      if (this.queue.length < 128) this.queue.push(candidate);
      return;
    }
    this.append(candidate);
  }
  private append(candidate: RTCIceCandidateInit) {
    this.pending = this.pending.then(async () => {
      if (!this.closed) await this.pc.addIceCandidate(candidate);
    }).catch((error) => { if (!this.closed) this.report("add-ice", error); });
  }
  async setRemote(description: RTCSessionDescriptionInit) {
    if (this.closed) return;
    await this.pc.setRemoteDescription(description);
    if (this.closed) return;
    for (const candidate of this.queue.splice(0)) this.append(candidate);
    await this.pending;
  }
  close() {
    this.closed = true;
    this.queue = [];
    this.pc.onconnectionstatechange = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.close();
  }
}

/** Bounded mailbox for candidates that arrive before their offer. */
export class EarlyIce {
  private entries = new Map<string, { ts: number; candidates: RTCIceCandidateInit[] }>();
  private retired = new Set<string>();
  push(key: string, candidate: RTCIceCandidateInit, now = Date.now()) {
    for (const [k, v] of this.entries) if (now - v.ts > 60_000) this.entries.delete(k);
    if (this.retired.has(key)) return;
    if (!this.entries.has(key)) {
      if (this.entries.size >= 64) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, { ts: now, candidates: [] });
    }
    const entry = this.entries.get(key)!;
    if (entry.candidates.length < 128) entry.candidates.push(candidate);
  }
  take(key: string) {
    const candidates = this.entries.get(key)?.candidates ?? [];
    this.entries.delete(key);
    return candidates;
  }
  retire(key: string) {
    this.entries.delete(key);
    this.retired.add(key);
    if (this.retired.size > 256) this.retired.delete(this.retired.values().next().value!);
  }
  clear() { this.entries.clear(); this.retired.clear(); }
}

export function receivedMedia(stats: RTCStatsReport, needsVideo: boolean): boolean {
  let received = false;
  stats.forEach((s) => {
    if (s.type !== "inbound-rtp" || s.isRemote) return;
    const kind = s.kind ?? s.mediaType;
    if (needsVideo ? kind === "video" && (s.framesDecoded ?? 0) > 0
      : kind === "audio" && (s.bytesReceived ?? 0) > 0) received = true;
  });
  return received;
}

/** Keep the pre-SDP mailbox bounded in bytes as well as candidate count. */
export function parseStreamIce(payload: unknown): {
  sessionId?: string; candidate: RTCIceCandidateInit;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const c = payload as Record<string, unknown>;
  if (typeof c.candidate !== "string" || c.candidate.length > 4096) return null;
  if (c.sessionId !== undefined && (typeof c.sessionId !== "string" || !c.sessionId || c.sessionId.length > 128)) return null;
  if (c.sdpMid != null && (typeof c.sdpMid !== "string" || c.sdpMid.length > 128)) return null;
  if (c.sdpMLineIndex != null && (typeof c.sdpMLineIndex !== "number" || !Number.isInteger(c.sdpMLineIndex) || c.sdpMLineIndex < 0 || c.sdpMLineIndex > 255)) return null;
  if (c.usernameFragment != null && (typeof c.usernameFragment !== "string" || c.usernameFragment.length > 256)) return null;
  return { sessionId: c.sessionId as string | undefined, candidate: {
    candidate: c.candidate,
    sdpMid: c.sdpMid as string | null | undefined,
    sdpMLineIndex: c.sdpMLineIndex as number | null | undefined,
    usernameFragment: c.usernameFragment as string | undefined,
  } };
}
