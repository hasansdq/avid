/**
 * Debug: PC instrumentation — patch RTCPeerConnection in the student tab
 * (Page.addScriptToEvaluateOnNewDocument) to observe ontrack/ice/connection
 * states end-to-end.
 */
import {
  log,
  sleep,
  CdpTab,
  newIsolatedTab,
  adminLogin,
  studentLogin,
  closeAllTabs,
  APP,
} from "./e2e-lib2";

const STREAM_PATH = "/stream/teststream001";

const PATCH = `
window.__pcs = [];
window.__pcLog = [];
const OrigPC = window.RTCPeerConnection;
class PatchedPC extends OrigPC {
  constructor(...args) {
    super(...args);
    window.__pcs.push(this);
    this.addEventListener('track', (ev) => {
      window.__pcLog.push('ONTRACK kind=' + ev.track.kind + ' streams=' + (ev.streams||[]).length + ' id=' + (ev.streams[0] && ev.streams[0].id));
    });
    this.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) window.__pcLog.push('LOCALICE ' + (ev.candidate.type || '') + ' ' + String(ev.candidate.candidate).slice(0, 60));
    });
    this.addEventListener('connectionstatechange', () => {
      window.__pcLog.push('CONNSTATE ' + this.connectionState);
    });
    this.addEventListener('iceconnectionstatechange', () => {
      window.__pcLog.push('ICESTATE ' + this.iceConnectionState);
    });
    this.addEventListener('signalingstatechange', () => {
      window.__pcLog.push('SIGSTATE ' + this.signalingState);
    });
  }
}
window.RTCPeerConnection = PatchedPC;
`;

async function main() {
  await closeAllTabs();
  const adminCookie = await adminLogin();
  const userCookie = await studentLogin("09121112233");

  const hostTab = new CdpTab(await newIsolatedTab());
  await hostTab.connect();
  await hostTab.setViewport(1280, 800, false);
  await hostTab.setCookie(adminCookie);
  await hostTab.navigate(`${APP}${STREAM_PATH}`);
  await hostTab.waitFor("host header", `document.querySelector("header") !== null`);
  await hostTab.eval(`Array.from(document.querySelectorAll("main button")).find(b => (b.getAttribute("aria-label")||"").includes("شروع پخش"))?.click()`);
  await hostTab.waitFor(
    "host publishing",
    `Array.from(document.querySelectorAll("main button")).some(b => (b.getAttribute("aria-label")||"").includes("قطع میکروفون"))`,
    20000
  );
  log("host publishing ✓");

  const studentTab = new CdpTab(await newIsolatedTab());
  await studentTab.connect();
  await studentTab.setViewport(390, 844, true);
  await studentTab.setCookie(userCookie);
  await studentTab.send("Page.addScriptToEvaluateOnNewDocument", { source: PATCH });
  await studentTab.navigate(`${APP}${STREAM_PATH}`);
  await studentTab.waitFor("student header", `document.querySelector("header") !== null`);

  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const s = await studentTab.evalSafe(`(() => ({
      pcs: (window.__pcs || []).map(p => p.connectionState + "/" + p.iceConnectionState + "/" + p.signalingState),
      recvers: (window.__pcs || []).map(p => p.getReceivers().map(r => r.track.kind + ":" + r.track.readyState + (r.track.muted ? ":muted" : "")).join("|")),
      dialog: !!document.querySelector('[role="dialog"]'),
      video: !!document.querySelector("video"),
    }))()`);
    log(`t=${i + 1}s:`, JSON.stringify(s));
    if (s.dialog) break;
  }
  const pcLog = await studentTab.evalSafe(`window.__pcLog || []`);
  log("PC EVENTS:", JSON.stringify(pcLog, null, 1).slice(0, 3000));
  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
