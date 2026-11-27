import { describe, expect, test } from "bun:test";
import {
  ZARINPAL_BADGE_URL,
  buildZarinpalCode,
  normalizeZarinpalBadgeUrl,
  zarinpalCodeFromInput,
  zarinpalDisplayValue,
} from "@/lib/trust-seals";

/**
 * نماد زرین‌پال — رگرسیون برای الزام کاربر:
 * «لوگو در فوتر نمایش داده نشد؛ لینک اعتبارسنجی کار می‌کرد.»
 *
 * علت ریشه‌ای: آدرس قدیمی لوگو www.zarinpal.com/badges/trustLogo/1.svg
 * پاسخ 404 می‌داد (زرین‌پال نشان‌ها را به CDN و فرمت PNG منتقل کرد).
 * مستندات فعلی: خروجی webservice رسمی TrustCode لوگو را از
 * cdn.zarinpal.com/badges/trustLogo/1.png می‌سازد.
 *
 * این آزمون‌ها تضمین می‌کنند: کدِ ساختی/ذخیره‌ای همیشه آدرسِ زنده‌ی CDN
 * را دارد و کدهای قدیمیِ مُرده هنگام ذخیره/رندر خوددرمانی می‌شوند.
 */

describe("normalizeZarinpalBadgeUrl — خوددرمانی URL لوگوی مُرده", () => {
  test("آدرس قدیمی www + svg → آدرس رسمی CDN PNG", () => {
    const legacy = `<a href="https://www.zarinpal.com/trustPage/amlm.ir" target="_blank"><img src="https://www.zarinpal.com/badges/trustLogo/1.svg" border="0" alt="دروازه پرداخت معتبر"></a>`;
    const fixed = normalizeZarinpalBadgeUrl(legacy);
    expect(fixed).toContain(`src="${ZARINPAL_BADGE_URL}"`);
    // لینک اعتبارسنجی دست‌نخورده می‌ماند
    expect(fixed).toContain("https://www.zarinpal.com/trustPage/amlm.ir");
    expect(fixed).not.toContain("www.zarinpal.com/badges");
  });

  test("آدرس بدون www و با پسوند متفاوت هم اصلاح می‌شود", () => {
    expect(
      normalizeZarinpalBadgeUrl(`<img src="https://zarinpal.com/badges/trustLogo/2.svg">`)
    ).toContain(`src="${ZARINPAL_BADGE_URL}"`);
    expect(
      normalizeZarinpalBadgeUrl(`<img src="https://cdn.zarinpal.com/badges/trustLogo/1.svg">`)
    ).toBe(`<img src="${ZARINPAL_BADGE_URL}">`);
  });

  test("آدرس زنده تغییر نمی‌کند و کد بی‌نشان دست‌نخورده می‌ماند", () => {
    const live = `<a href="https://www.zarinpal.com/trustPage/x.ir"><img src="${ZARINPAL_BADGE_URL}"></a>`;
    expect(normalizeZarinpalBadgeUrl(live)).toBe(live);
    const other = `<a href="https://example.com"><img src="https://example.com/logo.png"></a>`;
    expect(normalizeZarinpalBadgeUrl(other)).toBe(other);
    expect(normalizeZarinpalBadgeUrl("")).toBe("");
  });
});

describe("buildZarinpalCode — کد رسمی مطابق مستندات فعلی زرین‌پال", () => {
  test("دامنه → لینک trustPage + لوگوی CDN", () => {
    const code = buildZarinpalCode("amlm.ir");
    expect(code).toContain('href="https://www.zarinpal.com/trustPage/amlm.ir"');
    expect(code).toContain(`src="${ZARINPAL_BADGE_URL}"`);
    // لوگوی مُنده‌ی قدیمی هرگز تولید نمی‌شود
    expect(code).not.toContain("www.zarinpal.com/badges");
  });

  test("دامنه با https:// و مسیر پاکسازی می‌شود؛ نامعتبر → null؛ خالی → \"\"", () => {
    expect(buildZarinpalCode("https://amlm.ir/course")).toContain(
      "trustPage/amlm.ir"
    );
    expect(buildZarinpalCode("")).toBe("");
    expect(buildZarinpalCode("invalid")).toBeNull();
  });
});

describe("zarinpalCodeFromInput — ذخیره با خوددرمانی", () => {
  test("کد HTML خام با URL مُرده اصلاح و ذخیره می‌شود", () => {
    const out = zarinpalCodeFromInput(
      `<a href="https://www.zarinpal.com/trustPage/amlm.ir"><img src="https://www.zarinpal.com/badges/trustLogo/1.svg"></a>`
    );
    expect(out).toContain(`src="${ZARINPAL_BADGE_URL}"`);
    expect(out).toContain("trustPage/amlm.ir");
  });

  test("ورودی دامنه → کد رسمی؛ خالی → \"\"", () => {
    expect(zarinpalCodeFromInput("amlm.ir")).toContain(ZARINPAL_BADGE_URL);
    expect(zarinpalCodeFromInput("   ")).toBe("");
  });
});

describe("zarinpalDisplayValue — نمایش دامنه در پنل", () => {
  test("کد رسمی (لوگو CDN + trustPage) → فقط دامنه", () => {
    expect(zarinpalDisplayValue(buildZarinpalCode("amlm.ir"))).toBe("amlm.ir");
    // کد قدیمیِ ذخیره‌شده هم همین‌طور (الگوی badges/trustLogo هم‌چنان برمی‌خورد)
    expect(
      zarinpalDisplayValue(
        `<a href="https://www.zarinpal.com/trustPage/amlm.ir"><img src="https://www.zarinpal.com/badges/trustLogo/1.svg"></a>`
      )
    ).toBe("amlm.ir");
  });

  test("کد سفارشی بی‌الگو عیناً برمی‌گردد", () => {
    expect(zarinpalDisplayValue("<div>custom</div>")).toBe("<div>custom</div>");
    expect(zarinpalDisplayValue(null)).toBe("");
  });
});
