import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

/**
 * ویرایشگر ظاهری مدادی — تضمین رگرسیونی برای الزام کاربر:
 * «صرفِ تغییر متن نباید سفارشی‌سازی‌های ظاهری قبلی (رنگ/فونت/اندازه/مخفی)
 * را از بین ببرد.»
 *
 * قرارداد API: فیلدِ «ارسال‌نشده» = حفظ مقدار قبلی رکورد (patch semantics).
 * خودِ پاپ‌آپ ویرایشگر هم فیلدها را از وضعیت فعلی جایگاه پیش‌پر می‌کند و
 * افکت‌های رندر (text-shine / text-gradient / شمارندهٔ انیمیشنی) روی متن
 * سفارشی با renderText اعمال می‌شوند — این آزمون لایهٔ API را قفل می‌کند.
 */

let existingRow: Record<string, unknown> | null = null;
let upsertedWith: Record<string, unknown> | null = null;
let settingsUpdatedWith: Record<string, unknown> | null = null;

// Partial mocks: spread the currently-registered modules so every other
// export stays available to later test files in this same bun test process.
const authModule = await import("@/lib/auth");
mock.module("@/lib/auth", () => ({
  ...authModule,
  requireAdmin: async () => ({ denial: null as unknown }),
}));

const db = {
  siteText: {
    findUnique: async () => existingRow ?? null,
    upsert: async (args: { where?: { key?: string }; update?: Record<string, unknown>; create?: Record<string, unknown> }) => {
      upsertedWith = { ...(args.update ?? {}), ...(args.create ?? {}) };
      return { key: args.where?.key, ...upsertedWith };
    },
    deleteMany: async () => ({ count: 0 }),
  },
  installedFont: { findUnique: async () => ({ key: "vazirmatn" }) },
  siteSettings: {
    update: async (args: { data: Record<string, unknown> }) => {
      settingsUpdatedWith = args.data;
      return args.data;
    },
  },
};
mock.module("@/lib/db", () => ({ db }));

const { POST, DELETE } = await import("@/app/api/admin/site-texts/route");
const { DEFAULT_SETTINGS } = await import("@/lib/default-settings");

const request = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/admin/site-texts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  existingRow = null;
  upsertedWith = null;
  settingsUpdatedWith = null;
});

test("text-only edit keeps previous color, font, size and visibility", async () => {
  existingRow = {
    key: "hero.slogan",
    text: "متن قبلی",
    color: "#e11d48",
    fontKey: "vazirmatn",
    fontSize: 40,
    hidden: true,
  };
  const res = await POST(request({ key: "hero.slogan", text: "متن جدید" }));
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.text).toBe("متن جدید");
  expect((upsertedWith as Record<string, unknown>)?.color).toBe("#e11d48");
  expect((upsertedWith as Record<string, unknown>)?.fontKey).toBe("vazirmatn");
  expect((upsertedWith as Record<string, unknown>)?.fontSize).toBe(40);
  expect((upsertedWith as Record<string, unknown>)?.hidden).toBe(true);
});

test("text-only edit keeps per-device sizes and per-device visibility (patch semantics)", async () => {
  existingRow = {
    key: "hero.slogan",
    text: "متن قبلی",
    color: null,
    fontKey: null,
    fontSize: 36,
    fontSizeTablet: 28,
    fontSizeMobile: 22,
    hidden: false,
    hiddenDesktop: false,
    hiddenTablet: true,
    hiddenMobile: true,
  };
  const res = await POST(request({ key: "hero.slogan", text: "متن جدید" }));
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeTablet).toBe(28);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeMobile).toBe(22);
  expect((upsertedWith as Record<string, unknown>)?.hiddenTablet).toBe(true);
  expect((upsertedWith as Record<string, unknown>)?.hiddenMobile).toBe(true);
  expect((upsertedWith as Record<string, unknown>)?.hiddenDesktop).toBe(false);
});

test("per-device sizes and visibility round-trip with inheritance reset", async () => {
  existingRow = null;
  const res = await POST(
    request({
      key: "courses.title",
      text: "تیتر تازه",
      fontSize: 32,
      fontSizeTablet: 26,
      fontSizeMobile: 20,
      hiddenTablet: true,
    })
  );
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.fontSize).toBe(32);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeTablet).toBe(26);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeMobile).toBe(20);
  expect((upsertedWith as Record<string, unknown>)?.hiddenTablet).toBe(true);
  expect((upsertedWith as Record<string, unknown>)?.hiddenDesktop).toBe(false);
  expect((upsertedWith as Record<string, unknown>)?.hiddenMobile).toBe(false);
});

test("empty per-device size fields clear the override (inherit from desktop)", async () => {
  existingRow = {
    key: "hero.slogan",
    text: "متن",
    color: null,
    fontKey: null,
    fontSize: 30,
    fontSizeTablet: 24,
    fontSizeMobile: 18,
    hidden: false,
    hiddenTablet: true,
    hiddenMobile: false,
  };
  const res = await POST(
    request({
      key: "hero.slogan",
      fontSizeTablet: 0,
      fontSizeMobile: "",
      hiddenTablet: false,
    })
  );
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeTablet).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeMobile).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.hiddenTablet).toBe(false);
  // فیلدهای ارسال‌نشده دست‌نخورده می‌مانند
  expect((upsertedWith as Record<string, unknown>)?.fontSize).toBe(30);
  expect((upsertedWith as Record<string, unknown>)?.hiddenMobile).toBe(false);
});

test("out-of-range per-device size is rejected with a device-specific message", async () => {
  const res = await POST(
    request({ key: "courses.title", text: "x", fontSizeTablet: 200 })
  );
  expect(res.status).toBe(400);
  const data = (await res.json()) as { error?: string };
  expect(data.error ?? "").toContain("تبلت");
  expect(upsertedWith).toBe(null);
});

test("empty text-only edit on an untouched slot stores nulls, not wiped custom values", async () => {
  existingRow = null;
  const res = await POST(request({ key: "courses.title", text: "تیتر تازه" }));
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.text).toBe("تیتر تازه");
  expect((upsertedWith as Record<string, unknown>)?.color).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.fontKey).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.fontSize).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeTablet).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.fontSizeMobile).toBe(null);
  expect((upsertedWith as Record<string, unknown>)?.hidden).toBe(false);
  expect((upsertedWith as Record<string, unknown>)?.hiddenTablet).toBe(false);
  expect((upsertedWith as Record<string, unknown>)?.hiddenMobile).toBe(false);
});

test("explicit empty color resets to template default (documented dialog behavior)", async () => {
  existingRow = {
    key: "hero.slogan",
    text: "متن",
    color: "#e11d48",
    fontKey: null,
    fontSize: null,
    hidden: false,
  };
  const res = await POST(
    request({ key: "hero.slogan", text: "متن", color: "" })
  );
  expect(res.status).toBe(200);
  expect((upsertedWith as Record<string, unknown>)?.color).toBe(null);
});

test("hero slogan text edit mirrors into settings without touching visual fields", async () => {
  existingRow = null;
  const res = await POST(request({ key: "hero.slogan", text: "اسلوگان نو" }));
  expect(res.status).toBe(200);
  expect((settingsUpdatedWith as Record<string, unknown>)?.slogan).toBe(
    "اسلوگان نو"
  );
  expect(Object.keys(settingsUpdatedWith ?? {})).toEqual(["slogan"]);
});

test("unknown slot key is rejected instead of creating junk rows", async () => {
  const res = await POST(request({ key: "no.such.slot", text: "x" }));
  expect(res.status).toBe(400);
  expect(upsertedWith).toBe(null);
});

test("DELETE resets the slot (visual defaults return) and mirrors settings back", async () => {
  const res = await DELETE(
    new NextRequest(
      "http://localhost:3000/api/admin/site-texts?key=hero.slogan",
      { method: "DELETE" }
    )
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as { ok: boolean; resetText: string };
  expect(data.ok).toBe(true);
  expect((settingsUpdatedWith as Record<string, unknown>)?.slogan).toBe(
    DEFAULT_SETTINGS.slogan
  );
});
