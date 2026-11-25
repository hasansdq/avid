/**
 * E2E کامل استریم — با contexts ایزوله (استاد/دانشجو کوکی جدا)
 * Requires: chromium --use-fake-device-for-media-stream on :9222 (scripts: see tests/README)
 * Run: bun tests/e2e-stream2.ts
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

async function main() {
  await closeAllTabs();
  const adminCookie = await adminLogin();
  const userCookie = await studentLogin("09121112233");

  /* ————— تب استاد (دسکتاپ ۱۲۸۰×۸۰۰) ————— */
  const hostTab = new CdpTab(await newIsolatedTab());
  await hostTab.connect();
  await hostTab.setViewport(1280, 800, false);
  await hostTab.setCookie(adminCookie);
  await hostTab.navigate(`${APP}${STREAM_PATH}`);
  await hostTab.waitFor("host header", `document.querySelector("header") !== null`);

  const hostInfo = await hostTab.evalSafe(`(() => {
    const exitBtn = Array.from(document.querySelectorAll("header button")).find(x => (x.textContent||"").includes("خروج"));
    return {
      title: document.querySelector("header p")?.textContent,
      exitBtn: exitBtn ? { w: Math.round(exitBtn.getBoundingClientRect().width), text: (exitBtn.textContent||"").trim() } : null,
      toolbarBtns: Array.from(document.querySelectorAll("nav button")).map(b => (b.textContent || "").trim()),
      panelOpen: document.querySelector("aside") !== null,
      controlBtns: Array.from(document.querySelectorAll("main button")).map(b => (b.getAttribute("aria-label")||b.textContent||"").trim()).slice(0, 6),
    };
  })()`);
  log("HOST(desktop):", JSON.stringify(hostInfo, null, 1));
  await hostTab.screenshot("stream-host-desktop");

  // پنل: بسته پیش‌فرض → باز با دکمه‌ی نوار ابزار → بسته با ضربدر
  await hostTab.eval(`document.querySelectorAll("nav button")[0].click()`);
  await hostTab.waitFor("panel open", `document.querySelector("aside") !== null`);
  log("HOST panel opened via toolbar ✓");
  await hostTab.screenshot("stream-host-panel-open");
  await hostTab.eval(`document.querySelector("aside button[aria-label='بستن پنل']").click()`);
  await hostTab.waitFor("panel closed", `document.querySelector("aside") === null`);
  log("HOST panel closed via X ✓");

  // شروع پخش (دوربین جعلی)
  await hostTab.eval(`Array.from(document.querySelectorAll("main button")).find(b => (b.getAttribute("aria-label")||"").includes("شروع پخش"))?.click()`);
  await hostTab.waitFor(
    "host publishing",
    `Array.from(document.querySelectorAll("main button")).some(b => (b.getAttribute("aria-label")||"").includes("قطع میکروفون"))`,
    20000
  );
  log("HOST started broadcast ✓");
  await sleep(1500);
  await hostTab.screenshot("stream-host-publishing");

  /* ————— تب دانشجو (موبایل ۳۹۰×۸۴۴) ————— */
  const studentTab = new CdpTab(await newIsolatedTab());
  await studentTab.connect();
  await studentTab.setViewport(390, 844, true);
  await studentTab.setCookie(userCookie);
  await studentTab.navigate(`${APP}${STREAM_PATH}`);
  await studentTab.waitFor("student header", `document.querySelector("header") !== null`);

  // اتصال socket برقرار؟ (نشانگر «اتصال...» باید برود — عنوان صفحه خودش «اتصال» دارد!)
  await studentTab.waitFor(
    "connected (badge gone — not title)",
    `!(document.querySelector("header span.text-amber-600, header span.dark\\\\:text-amber-300") || document.querySelector('header [class*="text-amber"]'))`,
    20000
  );
  log("STUDENT socket connected ✓ (اتصال badge gone)");

  const roleCheck = await studentTab.evalSafe(`(() => {
    // دانشجو: دکمه‌ی «درخواست تصویر و گفتگو» یا انتخاب کیفیت وجود دارد؛ استاد: «شروع پخش»
    const isStudentView = !!document.querySelector("main button[aria-label='درخواست تصویر و گفتگو']") || !!document.querySelector('[role="radiogroup"]');
    const isHostView = !!document.querySelector("main button[aria-label*='شروع پخش']");
    return { isStudentView, isHostView };
  })()`);
  log("STUDENT role check:", JSON.stringify(roleCheck));
  if (!roleCheck.isStudentView) throw new Error("student tab shows HOST view — cookie isolation failed!");

  const panelsClosed = await studentTab.evalSafe(`document.querySelector("aside") === null`);
  log("STUDENT panels closed by default:", panelsClosed);
  await studentTab.screenshot("stream-student-mobile-initial");

  /* ————— نمایش افقی تمام‌صفحه ————— */
  await studentTab.waitFor(
    "landscape overlay",
    `document.querySelector('[role="dialog"][aria-label="نمایش افقی تمام‌صفحه‌ی کلاس"]') !== null`,
    25000
  );
  log("STUDENT landscape overlay appeared ✓");

  const videoState = await studentTab.evalSafe(`(() => {
    const overlay = document.querySelector('[role="dialog"]');
    const v = overlay ? overlay.querySelector("video") : null;
    const inner = overlay ? overlay.firstElementChild.getBoundingClientRect() : null;
    return {
      hasVideo: !!v,
      videoReady: v ? v.readyState : null,
      videoW: v ? v.videoWidth : null,
      trackState: v && v.srcObject ? v.srcObject.getTracks().map(t => t.kind + ":" + t.readyState + (t.muted ? ":muted" : "")).join(",") : null,
      innerBox: inner ? { x: Math.round(inner.x), y: Math.round(inner.y), w: Math.round(inner.width), h: Math.round(inner.height) } : null,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      inlineVideoSkipped: !document.querySelector("main video"),
    };
  })()`);
  log("STUDENT video state:", JSON.stringify(videoState, null, 1));
  await studentTab.screenshot("stream-student-mobile-landscape");

  const overlayBtns = await studentTab.evalSafe(`(() => {
    return Array.from(document.querySelectorAll('[role="dialog"] button')).map(b => b.getAttribute("aria-label"));
  })()`);
  log("STUDENT overlay buttons:", JSON.stringify(overlayBtns));

  // گفتگو از داخل نمایش افقی
  await studentTab.eval(`document.querySelector('[role="dialog"] button[aria-label="گفتگو"]').click()`);
  await studentTab.waitFor(
    "chat in landscape",
    `document.querySelector('[role="dialog"] [class*="w-72"]') !== null`,
    10000
  );
  log("STUDENT chat opened inside landscape ✓");
  await sleep(700);
  await studentTab.screenshot("stream-student-mobile-landscape-chat");

  // ارسال پیام از پنل — با کیبورد واقعی CDP (Input.insertText)
  await studentTab.eval(`document.querySelector('[role="dialog"] input').focus()`);
  await studentTab.send("Input.insertText", { text: "سلام استاد تست اتصال" });
  await sleep(300);
  const sendEnabled = await studentTab.evalSafe(`(() => {
    const btn = document.querySelector('[role="dialog"] form button[type="submit"]');
    return btn ? !btn.disabled : null;
  })()`);
  log("send button enabled after typing:", sendEnabled);
  await studentTab.eval(`document.querySelector('[role="dialog"] form button[type="submit"]').click()`);
  // self-echo — polling round trip ممکن است چند ثانیه طول بکشد
  let selfEcho = false;
  for (let i = 0; i < 12 && !selfEcho; i++) {
    await sleep(500);
    selfEcho = await studentTab.evalSafe(
      `document.querySelector('[role="dialog"]').textContent.includes("سلام استاد")`
    );
  }
  log("STUDENT sees own message:", selfEcho);
  // host: پنل چت را باز کن تا پیام در DOM دیده شود
  await hostTab.eval(`document.querySelectorAll("nav button")[0].click()`);
  await hostTab.waitFor("host chat open", `document.querySelector("aside") !== null`, 6000).catch(() => {});
  let hostSaw = false;
  for (let i = 0; i < 14 && !hostSaw; i++) {
    await sleep(500);
    hostSaw = await hostTab.evalSafe(`document.body.textContent.includes("سلام استاد")`);
  }
  log("HOST received student chat:", hostSaw ? "✓ (two-way messaging works)" : "✗");

  // بستن پنل با ضربدر
  await studentTab.eval(`document.querySelector('[role="dialog"] button[aria-label="بستن پنل"]').click()`);
  await studentTab.waitFor(
    "chat closed in landscape",
    `document.querySelector('[role="dialog"] button[aria-label="بستن پنل"]') === null`,
    10000
  );
  log("STUDENT chat closed via X ✓");

  // خروج از حالت افقی
  await studentTab.eval(`document.querySelector('[role="dialog"] button[aria-label="نمایش عمودی (خروج از حالت افقی)"]').click()`);
  await studentTab.waitFor("landscape exited", `document.querySelector('[role="dialog"]') === null`, 10000);
  log("STUDENT exited landscape ✓");
  await sleep(700);
  await studentTab.screenshot("stream-student-mobile-portrait");

  const portraitInfo = await studentTab.evalSafe(`(() => {
    const stageBtn = document.querySelector("main button[aria-label*='تمام‌صفحه']");
    const exitBtn = Array.from(document.querySelectorAll("header button")).find(b => b.getAttribute("aria-label") === "خروج از کلاس");
    const reqBtn = document.querySelector("main button[aria-label='درخواست تصویر و گفتگو']");
    return {
      inlineVideoNow: !!document.querySelector("main video"),
      maximizeBtn: stageBtn ? stageBtn.getAttribute("aria-label") : null,
      exitBtn: exitBtn ? { w: Math.round(exitBtn.getBoundingClientRect().width), text: (exitBtn.textContent||"").trim() } : null,
      requestBtn: reqBtn ? { w: Math.round(reqBtn.getBoundingClientRect().width), text: (reqBtn.textContent||"").trim() } : null,
    };
  })()`);
  log("STUDENT portrait info:", JSON.stringify(portraitInfo, null, 1));

  // بازگشت به حالت افقی با دکمه‌ی بزرگ‌نمایی
  await studentTab.eval(`document.querySelector("main button[aria-label*='تمام‌صفحه']").click()`);
  await studentTab.waitFor("re-entered landscape", `document.querySelector('[role="dialog"]') !== null`, 10000);
  log("STUDENT re-entered landscape via Maximize ✓");

  /* ————— تب استاد در موبایل (۳۹۰×۸۴۴) ————— */
  const hostMobileTab = new CdpTab(await newIsolatedTab());
  await hostMobileTab.connect();
  await hostMobileTab.setViewport(390, 844, true);
  await hostMobileTab.setCookie(adminCookie);
  let hostMobileOk = false;
  for (let attempt = 0; attempt < 3 && !hostMobileOk; attempt++) {
    await hostMobileTab.navigate(`${APP}${STREAM_PATH}`);
    try {
      await hostMobileTab.waitFor("host-mobile header", `document.querySelector("header") !== null`, 12000);
      hostMobileOk = true;
    } catch { log(`host-mobile retry #${attempt + 1}`); }
  }
  if (!hostMobileOk) throw new Error("host-mobile tab failed to load");
  const hostMobileInfo = await hostMobileTab.evalSafe(`(() => {
    const bar = document.querySelector("main > div");
    const btns = Array.from(bar.querySelectorAll("button"));
    const rects = btns.map(b => b.getBoundingClientRect());
    const sameRow = rects.length > 0 && rects.every(r => Math.abs(r.top - rects[0].top) < 5);
    const exitBtn = Array.from(document.querySelectorAll("header button")).find(x => x.getAttribute("aria-label") === "خروج از کلاس");
    return {
      buttonCount: btns.length,
      buttons: btns.map(b => ({
        aria: b.getAttribute("aria-label")?.slice(0, 30),
        text: (b.textContent||"").trim().slice(0, 24),
        w: Math.round(b.getBoundingClientRect().width),
      })),
      allInOneRow: sameRow,
      barW: Math.round(bar.getBoundingClientRect().width),
      exitBtn: exitBtn ? { w: Math.round(exitBtn.getBoundingClientRect().width), text: (exitBtn.textContent||"").trim() } : null,
    };
  })()`);
  log("HOST(mobile) controls:", JSON.stringify(hostMobileInfo, null, 1));
  await hostMobileTab.screenshot("stream-host-mobile-controls");

  await hostTab.close();
  await studentTab.close();
  await hostMobileTab.close();
  await closeAllTabs();
  log("E2E COMPLETE ✓");
  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
