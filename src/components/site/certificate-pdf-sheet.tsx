"use client";

import * as React from "react";
import type { SiteSettings } from "@prisma/client";
import { faDate, faDigits } from "@/lib/fa";

/** مشخصات گواهی‌نامه برای رندر برگه (هم‌شکل پاسخ API استعلام) */
export interface PdfCertificate {
  code: string;
  courseTitle: string;
  grade: number | null;
  note: string;
  issuedAt: string;
}

/* رنگ‌های ثابت برگه — همگی hex/rgba تا در html2canvas بی‌نقص رندر شوند
   (Tailwind v4 با oklch رنگ می‌سازد که html2canvas نمی‌شناسد) */
const C = {
  parchment: "#FDFBF5",
  teal: "#0F766E",
  tealDeep: "#115E59",
  tealSoft: "rgba(15, 118, 110, 0.07)",
  tealLine: "rgba(15, 118, 110, 0.28)",
  gold: "#D97706",
  goldDeep: "#B45309",
  goldSoft: "rgba(217, 151, 6, 0.10)",
  ink: "#1E293B",
  slate: "#334155",
  slateLight: "#64748B",
  slateFaint: "#94A3B8",
} as const;

/** معدل با ارقام فارسی و ممیز فارسی — ۱۸٫۵ / ۱۹٫۲۵ / ۱۸ */
function faGrade(g: number): string {
  const dec = g % 1 === 0 ? 0 : (g * 10) % 1 === 0 ? 1 : 2;
  return faDigits(g.toFixed(dec)).replace(".", "٫");
}

/**
 * CertificatePdfSheet — برگه‌ی رسمی A4 افقی (۱۱۲۳×۷۹۴ پیکسل).
 *
 * این برگه فقط برای «ساخت فایل PDF» (و پیش‌نمایش) استفاده می‌شود؛
 * رنگ‌ها و چیدمان با style درون‌خطی مشخص شده‌اند تا خروجی html2canvas
 * قطعی و یکسان باشد. برای PDF عرض دقیقاً ۱۱۲۳ و ارتفاع ۷۹۴ است.
 */
export function CertificatePdfSheet({
  cert,
  settings,
  userName,
}: {
  cert: PdfCertificate;
  settings: SiteSettings;
  userName: string;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  return (
    <div
      dir="rtl"
      style={{
        width: 1123,
        height: 794,
        position: "relative",
        overflow: "hidden",
        background: C.parchment,
        color: C.ink,
        fontFamily: "inherit",
      }}
    >
      {/* واترمارک مرکزی — حلقه‌های هم‌مرکز و ستاره */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="560"
          height="560"
          viewBox="0 0 560 560"
          style={{ opacity: 0.05 }}
        >
          <circle
            cx="280"
            cy="280"
            r="262"
            fill="none"
            stroke={C.teal}
            strokeWidth="10"
          />
          <circle
            cx="280"
            cy="280"
            r="228"
            fill="none"
            stroke={C.teal}
            strokeWidth="4"
          />
          <circle
            cx="280"
            cy="280"
            r="196"
            fill="none"
            stroke={C.teal}
            strokeWidth="1.5"
          />
          <polygon
            fill={C.teal}
            points="280,120 296,244 390,158 330,262 434,280 330,298 390,402 296,316 280,440 264,316 170,402 230,298 126,280 230,262 170,158 264,244"
          />
        </svg>
      </div>

      {/* قاب دوبل رسمی — فیروزه‌ای و طلایی */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 26,
          right: 26,
          bottom: 26,
          left: 26,
          border: `3px solid ${C.teal}`,
          borderRadius: 18,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 40,
          right: 40,
          bottom: 40,
          left: 40,
          border: `1.5px solid ${C.gold}`,
          borderRadius: 12,
        }}
      />
      {/* گوشه‌نژدهای طلایی */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 32,
          right: 32,
          width: 26,
          height: 26,
          borderTop: `3px solid ${C.goldDeep}`,
          borderRight: `3px solid ${C.goldDeep}`,
          borderTopRightRadius: 8,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 32,
          left: 32,
          width: 26,
          height: 26,
          borderTop: `3px solid ${C.goldDeep}`,
          borderLeft: `3px solid ${C.goldDeep}`,
          borderTopLeftRadius: 8,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 32,
          right: 32,
          width: 26,
          height: 26,
          borderBottom: `3px solid ${C.goldDeep}`,
          borderRight: `3px solid ${C.goldDeep}`,
          borderBottomRightRadius: 8,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 32,
          left: 32,
          width: 26,
          height: 26,
          borderBottom: `3px solid ${C.goldDeep}`,
          borderLeft: `3px solid ${C.goldDeep}`,
          borderBottomLeftRadius: 8,
        }}
      />

      {/* محتوای برگه */}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "58px 66px 44px",
        }}
      >
        {/* سربرگ — لوگو/نام آکادمی + کد رهگیری */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {settings.logoUrl && !logoFailed ? (
              <img
                src={settings.logoUrl}
                alt={settings.siteName}
                width={54}
                height={54}
                onError={() => setLogoFailed(true)}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  border: "1px solid #E2E8F0",
                  objectFit: "cover",
                  background: "#FFFFFF",
                }}
              />
            ) : (
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: "#0F766E",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 900,
                }}
              >
                آ
              </div>
            )}
            <div>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 900,
                  color: C.tealDeep,
                }}
              >
                آکادمی {settings.siteName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.slateLight,
                  marginTop: 2,
                }}
              >
                {settings.tagline}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.slateLight,
                letterSpacing: 1,
              }}
            >
              کد رهگیری
            </div>
            <div
              dir="ltr"
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: C.goldDeep,
                letterSpacing: 3,
                marginTop: 3,
                border: `1.5px solid ${C.gold}`,
                borderRadius: 10,
                padding: "5px 14px",
                background: C.goldSoft,
                display: "inline-block",
              }}
            >
              {cert.code}
            </div>
          </div>
        </div>

        {/* متن اصلی */}
        <div style={{ textAlign: "center", padding: "0 30px" }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              color: C.teal,
              letterSpacing: "-0.5px",
            }}
          >
            گواهی‌نامه‌ی رسمی پایان دوره
          </div>
          <div
            style={{
              width: 170,
              height: 4,
              borderRadius: 4,
              background: C.gold,
              margin: "14px auto 0",
            }}
          />
          <div
            style={{
              marginTop: 26,
              fontSize: 13.5,
              fontWeight: 600,
              color: C.slateLight,
            }}
          >
            بدین‌نامه تأیید می‌شود که
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 38,
              fontWeight: 900,
              color: C.ink,
            }}
          >
            {userName}
          </div>
          <div
            style={{
              marginTop: 14,
              marginInline: "auto",
              maxWidth: 730,
              fontSize: 15.5,
              lineHeight: 2,
              fontWeight: 600,
              color: C.slate,
            }}
          >
            دوره‌ی آموزشی «{cert.courseTitle}» را در آکادمی {settings.siteName}
            {cert.grade !== null &&
            cert.grade !== undefined &&
            cert.grade >= 10
              ? " با موفقیت "
              : " "}
            به پایان رسانده و این گواهی‌نامه مطابق ضوابط آکادمی صادر گردیده است.
          </div>
          {cert.note ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: C.slateLight,
              }}
            >
              {cert.note}
            </div>
          ) : null}
        </div>

        {/* پایین — تاریخ / معدل / مهر و امضا */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 36,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.slateLight,
                }}
              >
                تاریخ صدور
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 800,
                  color: C.ink,
                }}
              >
                {faDate(cert.issuedAt)}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.slateLight,
                }}
              >
                معدل
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 14,
                  fontWeight: 800,
                  color: C.tealDeep,
                  border: "1.5px solid rgba(15, 118, 110, 0.45)",
                  background: C.tealSoft,
                  borderRadius: 10,
                  padding: "5px 16px",
                  display: "inline-block",
                }}
              >
                {cert.grade !== null && cert.grade !== undefined
                  ? `${faGrade(cert.grade)} از ${faDigits(20)}`
                  : "—"}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  position: "relative",
                  width: 86,
                  height: 86,
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `2.5px solid ${C.goldDeep}`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 7,
                    borderRadius: "50%",
                    border: `1px dashed ${C.goldDeep}`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.goldDeep,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1,
                    }}
                  >
                    آکادمی
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>
                    {settings.siteName}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 8,
                  width: 190,
                  borderTop: "1.5px solid #94A3B8",
                  paddingTop: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.slateLight,
                }}
              >
                مهر و امضای آکادمی {settings.siteName}
              </div>
            </div>
          </div>

          {/* نوار اصالت */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 10,
              borderTop: `1px solid ${C.tealLine}`,
              fontSize: 10.5,
              fontWeight: 600,
              color: C.slateFaint,
              textAlign: "center",
            }}
          >
            اصالت این گواهی‌نامه از طریق صفحه‌ی «استعلام گواهی‌نامه» در سایت
            آکادمی و با کد ملی دارنده‌ی آن قابل بررسی است — کد رهگیری:{" "}
            <span dir="ltr" style={{ fontWeight: 800, letterSpacing: 1 }}>
              {cert.code}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
