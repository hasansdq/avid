import { expect, test } from "bun:test";
import { bindMediaPlayback } from "../src/components/stream/media-playback";
import { applySenderQuality, canRetuneQuality } from "../src/components/stream/sender-quality";

const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((a,b) => {resolve=a;reject=b;});
  return {promise,resolve,reject};
}
class Video extends EventTarget {
  srcObject: unknown = null; muted = false; paused = true;
  pending: ReturnType<typeof deferred>[] = [];
  play() { const d=deferred(); this.pending.push(d); return d.promise; }
}
const error=(name:string)=>Object.assign(new Error(name),{name});
test("rejection from disposed playback cannot mute a new stream", async () => {
 const v=new Video(), target=new EventTarget(), states:boolean[]=[];
 const old=bindMediaPlayback(v as unknown as HTMLVideoElement,{} as MediaStream,false,(x)=>states.push(x),target);
 old.dispose();
 const current=bindMediaPlayback(v as unknown as HTMLVideoElement,{} as MediaStream,false,(x)=>states.push(x),target);
 v.pending[0].reject(error("NotAllowedError"));await tick();
 expect(v.muted).toBe(false);expect(states).not.toContain(true);
 v.pending[1].resolve();await tick();current.dispose();
});
test("AbortError never mutes audio and metadata retries playback", async () => {
 const v=new Video(), states:boolean[]=[];
 const p=bindMediaPlayback(v as unknown as HTMLVideoElement,{} as MediaStream,false,(x)=>states.push(x),new EventTarget());
 v.pending[0].reject(error("AbortError"));await tick();expect(v.muted).toBe(false);expect(states).not.toContain(true);
 v.dispatchEvent(new Event("canplay"));expect(v.pending).toHaveLength(2);
 v.pending[1].resolve();await tick();p.dispose();
});
test("policy denial offers explicit audio unlock and a gesture resumes it", async () => {
 const v=new Video(), states:boolean[]=[], target=new EventTarget();
 const p=bindMediaPlayback(v as unknown as HTMLVideoElement,{} as MediaStream,false,(x)=>states.push(x),target);
 v.pending[0].reject(error("NotAllowedError"));await tick();expect(v.muted).toBe(true);expect(states.at(-1)).toBe(true);
 v.pending[1].resolve();target.dispatchEvent(new Event("click"));expect(v.muted).toBe(false);
 v.pending[2].resolve();await tick();expect(states.at(-1)).toBe(false);
 p.dispose();target.dispatchEvent(new Event("click"));expect(v.pending).toHaveLength(3);
});
test("local preview stays muted without an audio unlock prompt", async () => {
 const v=new Video(), states:boolean[]=[];
 const p=bindMediaPlayback(v as unknown as HTMLVideoElement,{} as MediaStream,true,(x)=>states.push(x),new EventTarget());
 v.pending[0].reject(error("NotAllowedError"));await tick();expect(v.muted).toBe(true);expect(states).not.toContain(true);p.dispose();
});
function peer() {
 const audio={kind:"audio"} as MediaStreamTrack, video={kind:"video"} as MediaStreamTrack;
 const applied:any[]=[];
 const senders=[audio,video].map(track=>({track,getParameters:()=>({encodings:[{}]}),setParameters:async(p:any)=>{applied.push({kind:track.kind,...p.encodings[0]});}}));
 const pc={connectionState:"connected",signalingState:"stable",getSenders:()=>senders} as unknown as RTCPeerConnection;
 return {pc,audio,video,applied,senders};
}
test("normal/low video changes reuse the peer only when tracks are unchanged",()=>{
 const {pc,audio,video}=peer();
 expect(canRetuneQuality(pc,"full","low",[audio,video])).toBe(true);
 expect(canRetuneQuality(pc,"low","full",[audio,video])).toBe(true);
 expect(canRetuneQuality(pc,"full","audio",[audio])).toBe(false);
 expect(canRetuneQuality(pc,"audio","low",[audio,video])).toBe(false);
 expect(canRetuneQuality(pc,"full","low",[audio,video,{kind:"video"} as MediaStreamTrack])).toBe(false);
});
test("voice bitrate and priority persist in both normal and low modes",async()=>{
 for(const mode of ["full","low","audio"] as const){
  const p=peer();if(mode==="audio")p.senders.splice(1);
  expect(await applySenderQuality(p.pc,mode)).toBe(true);
  expect(p.applied.find(x=>x.kind==="audio")).toMatchObject({maxBitrate:32000,priority:"high"});
  if(mode!=="audio")expect(p.applied.find(x=>x.kind==="video").maxBitrate).toBe(mode==="low"?250000:600000);
 }
});
test("unsupported priority fields fall back to bitrate-only parameters",async()=>{
 const p=peer();p.senders[0].setParameters=async params=>{if('priority' in params.encodings[0])throw error('NotSupportedError');p.applied.push(params.encodings[0]);};
 expect(await applySenderQuality(p.pc,"low")).toBe(true);expect(p.applied[0].maxBitrate).toBe(32000);
});

test("rapid quality changes serialize parameter updates and leave the latest bitrate active",async()=>{
 const p=peer();let active=0,maxActive=0;
 for(const sender of p.senders)sender.setParameters=async params=>{
  active++;maxActive=Math.max(maxActive,active);await tick();p.applied.push({kind:sender.track.kind,...params.encodings[0]});active--;
 };
 await Promise.all([applySenderQuality(p.pc,"full"),applySenderQuality(p.pc,"low")]);
 expect(maxActive).toBe(1);expect(p.applied.filter(x=>x.kind==="video").map(x=>x.maxBitrate)).toEqual([600000,250000]);
});
