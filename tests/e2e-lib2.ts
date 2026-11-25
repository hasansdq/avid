/**
 * E2E lib v2 — با contexts ایزوله‌ی CDP (cookie jar جدا برای هر نقش)
 * تا تب «دانشجو» کوکی مدیر را نبیند. فقط برای آزمایش دستی سندباکس.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const CDP_BASE = "http://127.0.0.1:9222";
const APP = "http://127.0.0.1:3000";
const SHOTS = "/home/z/my-project/docs/screenshots";
mkdirSync(SHOTS, { recursive: true });

function log(...args: unknown[]) {
  console.log("[e2e]", ...args);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ————— browser-level CDP (برای contexts ایزوله) ————— */

let bws: WebSocket | null = null;
let bId = 1;
const bPending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

function bSend(
  method: string,
  params: Record<string, unknown> = {}
): Promise<any> {
  const id = bId++;
  return new Promise((resolve, reject) => {
    bPending.set(id, { resolve, reject });
    bws!.send(JSON.stringify({ id, method, params }));
  });
}

async function ensureBrowser(): Promise<void> {
  if (bws) return;
  const ver = await (await fetch(`${CDP_BASE}/json/version`)).json();
  bws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    bws!.addEventListener("open", () => resolve());
    bws!.addEventListener("error", () => reject(new Error("browser ws failed")));
  });
  bws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && bPending.has(msg.id)) {
      const p = bPending.get(msg.id)!;
      bPending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
}

/** ساخت تب داخل context ایزوله (کوکی‌های جدا) */
async function newIsolatedTab(): Promise<{
  id: string;
  webSocketDebuggerUrl: string;
}> {
  await ensureBrowser();
  const ctx = await bSend("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const target = await bSend("Target.createTarget", {
    url: "about:blank",
    browserContextId: ctx.browserContextId,
  });
  for (let i = 0; i < 10; i++) {
    const list = await (await fetch(`${CDP_BASE}/json/list`)).json();
    const t = (list as any[]).find((x) => x.id === target.targetId);
    if (t?.webSocketDebuggerUrl) return t;
    await sleep(200);
  }
  throw new Error("page ws url not found for target " + target.targetId);
}

/* ————— CDP tab ————— */

class CdpTab {
  ws!: WebSocket;
  nextId = 1;
  pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();

  constructor(
    public targetInfo: { id: string; webSocketDebuggerUrl: string }
  ) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.targetInfo.webSocketDebuggerUrl);
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("ws error")));
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const state = (await this.eval("document.readyState")).value;
      if (state === "complete") break;
    }
    await sleep(1000);
  }

  eval(expression: string): Promise<any> {
    return this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    }).then((r) => {
      if (r.exceptionDetails) {
        throw new Error(
          `eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`
        );
      }
      return r.result;
    });
  }

  evalSafe(expression: string): Promise<any> {
    return this.send("Runtime.evaluate", {
      expression: `(function(){ try { return (${expression}); } catch(e){ return "__ERR__" + e.message; } })()`,
      returnByValue: true,
    }).then((r) => r.result?.value ?? null);
  }

  async setViewport(
    width: number,
    height: number,
    mobile: boolean
  ): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
  }

  async setCookie(cookie: string): Promise<void> {
    const [name, value] = cookie.split("=");
    await this.send("Network.setCookie", { name, value, url: APP });
  }

  async screenshot(name: string): Promise<void> {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(res.data, "base64"));
    log(`screenshot → ${name}.png`);
  }

  async waitFor(
    label: string,
    expression: string,
    timeoutMs = 15000
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = await this.evalSafe(expression);
      if (v !== "__ERR__" && v) return v;
      await sleep(300);
    }
    throw new Error(`timeout waiting for: ${label}`);
  }

  async close(): Promise<void> {
    try {
      this.ws.close();
    } catch {
      /* بسته */
    }
  }
}

/* ————— logins ————— */

async function adminLogin(): Promise<string> {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  if (!cookie.startsWith("avid_admin=")) throw new Error("no admin cookie");
  log("admin login OK");
  return cookie;
}

async function studentLogin(phone: string): Promise<string> {
  const req = await fetch(`${APP}/api/user/phone/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const reqJson = (await req.json().catch(() => null)) as
    | { devCode?: string }
    | null;
  const code = reqJson?.devCode;
  if (!code) throw new Error("otp request failed");
  const ver = await fetch(`${APP}/api/user/phone/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  if (!ver.ok) throw new Error(`verify failed: ${ver.status}`);
  const cookie = (ver.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  if (!cookie.startsWith("avid_user=")) throw new Error("no user cookie");
  log("student login OK");
  return cookie;
}

async function closeAllTabs(): Promise<void> {
  const list = await (await fetch(`${CDP_BASE}/json/list`)).json();
  for (const t of list as any[]) {
    if (t.type === "page")
      await fetch(`${CDP_BASE}/json/close/${t.id}`).catch(() => {});
  }
}

export {
  log,
  sleep,
  CdpTab,
  newIsolatedTab,
  adminLogin,
  studentLogin,
  closeAllTabs,
  APP,
};
