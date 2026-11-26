import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
let admin = false, user = false, invited = false, kicked = false, owner = false;
let ended = false;
const stream = () => ({id:"room",hostId:owner?"user":null,inviteSlug:null,title:"test",status:ended?"ended":"live"});
mock.module("@/lib/auth",()=>({getSessionAdmin:async()=>admin?{username:"admin"}:null}));
mock.module("@/lib/user-auth",()=>({getSessionUser:async()=>user?{id:"user",firstName:"test",lastName:"user"}:null}));
mock.module("@/lib/db",()=>({db:{user:{findUnique:async()=>({role:"teacher",firstName:"test",lastName:"host"})}}}));
mock.module("@/lib/streams",()=>({
 findStreamByRef:async()=>stream(),joinByLinkAllowed:()=>false,
 userInvitedToStream:async()=>invited?[{id:"invite"}]:[],userKickedFromStream:async()=>kicked,
}));
const {GET}=await import("@/app/api/streams/[id]/route");
const request=()=>GET(new NextRequest("https://amlm.ir/api/streams/room"),{params:Promise.resolve({id:"room"})});
beforeEach(()=>{admin=user=invited=kicked=owner=ended=false;});
for (const reason of ["guest","not-invited","kicked","ended"]) test(`TURN configuration withheld from ${reason}`,async()=>{
 user=reason!=="guest";invited=true;
 if(reason==="not-invited")invited=false;
 if(reason==="kicked")kicked=true;
 if(reason==="ended")ended=true;
 const r=await request();const d=await r.json();
 expect(d.canJoin).toBe(false);expect(d.iceConfig).toBeUndefined();
 expect(r.headers.get("cache-control")).toContain("private, no-store");
});
for (const role of ["admin","owner","student"]) test(`authorized ${role} receives uncached runtime ICE configuration`,async()=>{
 admin=role==="admin";user=role!=="admin";owner=role==="owner";invited=true;
 const r=await request();const d=await r.json();
 expect(d.canJoin).toBe(true);expect(d.iceConfig.iceServers).toBeArray();
 expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("vary")).toBe("Cookie");
});
