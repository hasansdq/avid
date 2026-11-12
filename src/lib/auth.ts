import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "avid_admin";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // ۷ روز

/* ---------------- هش رمز عبور (scrypt + salt) ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  if (candidate.length !== original.length) return false;
  return timingSafeEqual(candidate, original);
}

/* ---------------- نشست‌ها ---------------- */

export async function createSession(adminId: string) {
  // پاک‌سازی نشست‌های منقضی
  await db.adminSession
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const token = randomBytes(32).toString("hex");
  await db.adminSession.create({
    data: {
      token,
      adminId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { token, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export async function getSessionAdmin(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.adminSession.findUnique({
    where: { token },
    include: { admin: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.admin;
}

export async function destroySession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.adminSession.deleteMany({ where: { token } }).catch(() => {});
  }
}

/** گارد ساده برای روت‌های ادمین: در صورت نبود دسترسی پاسخ 401 برمی‌گرداند */
export async function requireAdmin(req: NextRequest) {
  const admin = await getSessionAdmin(req);
  if (!admin) {
    return {
      admin: null,
      denial: NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً ابتدا وارد شوید." },
        { status: 401 }
      ),
    };
  }
  return { admin, denial: null };
}
