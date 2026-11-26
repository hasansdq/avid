import { expect, test } from "bun:test";
import { PeerSession, EarlyIce, receivedMedia, parseStreamIce } from "../src/components/stream/peer-session";

function fixture() {
  const added: RTCIceCandidateInit[] = [];
  const failures: string[] = [];
  let release: (() => void) | undefined;
  const pc = {
    remoteDescription: null as RTCSessionDescriptionInit | null,
    onconnectionstatechange: () => {}, onicecandidate: () => {}, ontrack: () => {},
    closed: false,
    async setRemoteDescription(d: RTCSessionDescriptionInit) {
      await new Promise<void>((r) => { release = r; }); this.remoteDescription = d;
    },
    async addIceCandidate(c: RTCIceCandidateInit) {
      if (!this.remoteDescription) throw new Error("early"); added.push(c);
    },
    close() { this.closed = true; },
  };
  const session = new PeerSession("generation-1", pc as unknown as RTCPeerConnection, (op) => failures.push(op));
  return { pc, session, added, failures, release: () => release?.() };
}
const a = { candidate: "candidate-a", sdpMid: "0" };
const b = { candidate: "candidate-b", sdpMid: "0" };

test("ICE before and during remote SDP is queued and applied after SDP", async () => {
  const f = fixture(); f.session.addIce(a);
  const remote = f.session.setRemote({ type: "answer", sdp: "test" });
  f.session.addIce(b); expect(f.added).toEqual([]);
  f.release(); await remote;
  expect(f.added).toEqual([a, b]); expect(f.failures).toEqual([]);
});
test("late SDP completion after close cannot apply ICE to a replacement", async () => {
  const old = fixture(), next = fixture(); old.session.addIce(a);
  const work = old.session.setRemote({ type: "offer" }); old.session.close();
  old.release(); await work;
  expect(old.added).toEqual([]); expect(next.added).toEqual([]);
  expect(old.pc.onconnectionstatechange).toBeNull();
});
test("ICE errors are reported and do not break later candidates", async () => {
  const f = fixture(); f.pc.remoteDescription = { type: "answer" };
  let calls = 0;
  f.pc.addIceCandidate = async (c) => { if (++calls === 1) throw new Error("bad"); f.added.push(c); };
  f.session.addIce(a); f.session.addIce(b);
  await new Promise((r) => setTimeout(r, 0));
  expect(f.failures).toEqual(["add-ice"]); expect(f.added).toEqual([b]);
});
test("mailbox retains ICE before an offer, separates generations and ignores retired ones", () => {
  const box = new EarlyIce(); box.push("peer:old", a); box.push("peer:new", b);
  box.retire("peer:old"); box.push("peer:old", a);
  expect(box.take("peer:old")).toEqual([]); expect(box.take("peer:new")).toEqual([b]);
  expect(box.take("peer:new")).toEqual([]);
});
test("early ICE mailbox expires and bounds remote input", () => {
  const box = new EarlyIce(); box.push("expired", a, 0); box.push("fresh", b, 60001);
  expect(box.take("expired")).toEqual([]);
  for (let i = 0; i < 200; i++) box.push("bounded", a);
  expect(box.take("bounded")).toHaveLength(128);
  for (let i = 0; i < 100; i++) box.push(`peer:${i}`, a);
  expect(box.take("peer:0")).toEqual([]); expect(box.take("peer:99")).toEqual([a]);
  box.clear(); expect(box.take("peer:98")).toEqual([]);
});
function stats(rows: object[]) { return new Map(rows.map((r, i) => [String(i), r])) as unknown as RTCStatsReport; }
test("ontrack, outbound bytes and encoded video do not count as received media", () => {
  expect(receivedMedia(stats([]), true)).toBe(false);
  expect(receivedMedia(stats([{ type: "outbound-rtp", kind: "video", framesEncoded: 10 }]), true)).toBe(false);
  expect(receivedMedia(stats([{ type: "inbound-rtp", kind: "video", bytesReceived: 200, framesDecoded: 0 }]), true)).toBe(false);
});
test("video must have decoded frames; audio-only must have received bytes", () => {
  expect(receivedMedia(stats([{ type: "inbound-rtp", kind: "video", framesDecoded: 2 }]), true)).toBe(true);
  expect(receivedMedia(stats([{ type: "inbound-rtp", kind: "audio", bytesReceived: 30 }]), false)).toBe(true);
  expect(receivedMedia(stats([{ type: "inbound-rtp", kind: "audio", bytesReceived: 30 }]), true)).toBe(false);
});


test("ICE parser isolates generation IDs and strips unrelated untrusted data", () => {
  expect(parseStreamIce({ candidate: "candidate", sdpMid: "0", sessionId: "negotiation", extra: "discard" }))
    .toEqual({ sessionId: "negotiation", candidate: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: undefined, usernameFragment: undefined } });
  expect(parseStreamIce({ candidate: "legacy", sdpMLineIndex: 0 })?.sessionId).toBeUndefined();
});
test("oversized or malformed ICE cannot fill the early-candidate mailbox", () => {
  for (const c of [null, {}, {candidate:"x".repeat(4097)}, {candidate:"ok",sessionId:0},
    {candidate:"ok",sdpMLineIndex:-1}, {candidate:"ok",usernameFragment:"x".repeat(257)}])
    expect(parseStreamIce(c)).toBeNull();
});
