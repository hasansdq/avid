/**
 * Light E2E — چت دوطرفه + کنترل‌های موبایل استاد (بدون اسکرین‌شات‌های سنگین)
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

  /* — استاد: شروع پخش — */
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
  const hostHasCam = await hostTab.evalSafe(
    `!!document.querySelector("main button[aria-label*='قطع دوربین']")`
  );
  log("host publishing ✓ (cam track present:", hostHasCam, ")");

  /* — دانشجو: پرتره (بدون نمایش افقی — آن را می‌بندیم تا کامپوزیت سبک بماند) — */
  const studentTab = new CdpTab(await newIsolatedTab());
  await studentTab.connect();
  await studentTab.setViewport(390, 844, true);
  await studentTab.setCookie(userCookie);
  await studentTab.navigate(`${APP}${STREAM_PATH}`);
  await studentTab.waitFor("student header", `document.querySelector("header") !== null`);
  await studentTab.waitFor(
    "connected",
    `!document.querySelector('header span.animate-spin')`,
    20000
  );
  // بستن نمایش افقی (کلید «نمایش عمودی») برای تست چت در پرتره
  await studentTab.waitFor(
    "landscape present",
    `document.querySelector('[role="dialog"]') !== null`,
    25000
  );
  await studentTab.eval(
    `document.querySelector('[role="dialog"] button[aria-label="نمایش عمودی (خروج از حالت افقی)"]').click()`
  );
  await studentTab.waitFor("landscape exited", `document.querySelector('[role="dialog"]') === null`, 10000);
  log("student in portrait (landscape exited for light chat test) ✓");

  /* — چت از حالت پرتره: باز کردن گفتگو با کلید زیر هدر — */
  await studentTab.eval(`document.querySelectorAll("nav button")[0].click()`);
  await studentTab.waitFor("chat sheet open", `document.querySelector("aside") !== null`, 8000);
  log("student chat sheet opened via toolbar ✓");

  await studentTab.eval(`document.querySelector("aside input").focus()`);
  await studentTab.send("Input.insertText", { text: "پیام تست دانشجو" });
  await sleep(400);
  await studentTab.eval(`document.querySelector("aside form button[type='submit']").click()`);
  log("student sent chat message");

  let selfEcho = false;
  for (let i = 0; i < 14 && !selfEcho; i++) {
    await sleep(500);
    selfEcho = await studentTab.evalSafe(`document.querySelector("aside")?.textContent.includes("پیام تست دانشجو")`);
  }
  log("student sees own message:", selfEcho);

  // host باید پیام را ببیند — پنل گفتگوی استاد را باز کن
  await hostTab.eval(`document.querySelectorAll("nav button")[0].click()`);
  await hostTab.waitFor("host chat open", `document.querySelector("aside") !== null`, 8000).catch(() => {});
  let hostSaw = false;
  for (let i = 0; i < 14 && !hostSaw; i++) {
    await sleep(500);
    hostSaw = await hostTab.evalSafe(`document.body.textContent.includes("پیام تست دانشجو")`);
  }
  log("HOST saw student message:", hostSaw);

  /* — استاد پاسخ می‌دهد — */
  if (hostSaw) {
    await hostTab.eval(`document.querySelector("aside input").focus()`);
    await hostTab.send("Input.insertText", { text: "پاسخ استاد" });
    await sleep(400);
    await hostTab.eval(`document.querySelector("aside form button[type='submit']").click()`);
    let studentSawReply = false;
    for (let i = 0; i < 14 && !studentSawReply; i++) {
      await sleep(500);
      studentSawReply = await studentTab.evalSafe(`document.querySelector("aside")?.textContent.includes("پاسخ استاد")`);
    }
    log("student saw HOST reply:", studentSawReply);
  }

  // بستن پنل دانشجو با ضربدر
  await studentTab.eval(`document.querySelector("aside button[aria-label='بستن پنل']").click()`);
  await studentTab.waitFor("student panel closed", `document.querySelector("aside") === null`, 8000);
  log("student panel closed via X ✓");

  /* — کنترل‌های موبایل استاد — */
  const hostMobileTab = new CdpTab(await newIsolatedTab());
  await hostMobileTab.connect();
  await hostMobileTab.setViewport(390, 844, true);
  await hostMobileTab.setCookie(adminCookie);
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    await hostMobileTab.navigate(`${APP}${STREAM_PATH}`);
    try {
      await hostMobileTab.waitFor("hm header", `document.querySelector("header") !== null`, 12000);
      ok = true;
    } catch {
      log(`host-mobile retry #${a + 1}`);
    }
  }
  if (ok) {
    const info = await hostMobileTab.evalSafe(`(() => {
      const bar = document.querySelector("main > div");
      const btns = Array.from(bar.querySelectorAll("button"));
      const rects = btns.map(b => b.getBoundingClientRect());
      const sameRow = rects.length > 0 && rects.every(r => Math.abs(r.top - rects[0].top) < 5);
      const exitBtn = Array.from(document.querySelectorAll("header button")).find(x => x.getAttribute("aria-label") === "خروج از کلاس");
      return {
        buttonCount: btns.length,
        buttons: btns.map(b => ({
          aria: b.getAttribute("aria-label")?.slice(0, 30),
          w: Math.round(b.getBoundingClientRect().width),
        })),
        allInOneRow: sameRow,
        barW: Math.round(bar.getBoundingClientRect().width),
        exitBtnW: exitBtn ? Math.round(exitBtn.getBoundingClientRect().width) : null,
      };
    })()`);
    log("HOST(mobile) controls:", JSON.stringify(info, null, 1));
    await hostMobileTab.screenshot("stream-host-mobile-controls");
  }

  await hostTab.close();
  await studentTab.close();
  await hostMobileTab.close().catch(() => {});
  await closeAllTabs();
  log("LIGHT E2E COMPLETE ✓");
  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
