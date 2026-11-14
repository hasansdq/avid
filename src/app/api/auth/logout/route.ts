import { NextRequest, NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await destroySession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(req, 0));
  return res;
}
