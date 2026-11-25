import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const allowed = { exceeded: false, retryAfterSec: 0, count: 0 };
let userWriteError = false;
let ipWriteError = false;
let readError = false;
let blocked = false;
let secondFactor = false;
let verifiedCode = true;
let passwordHash = "";

const create = mock(async () => ({}));
const hitRate = mock(async (key: string) => ({
  ...allowed,
  storageError: key.includes(":u:") ? userWriteError : ipWriteError,
}));
const sendOtpSms = mock(async () => ({ provider: "test", delivered: true }));
mock.module("@/lib/db", () => ({ db: {
  adminUser: { findUnique: async () => ({ id: "test-admin", username: "test-admin", phone: "09000000000", twoFactorEnabled: secondFactor, passwordHash }) },
  adminSession: { deleteMany: async () => ({ count: 0 }), create },
} }));
mock.module("@/lib/rate-limit", () => ({
  clientIpOf: () => "127.0.0.1", hitRate,
  checkRate: async () => ({ ...allowed, storageError: readError, exceeded: blocked, retryAfterSec: 10 }),
  rateLimited: () => Response.json({ error: "limited" }, { status: 429 }),
  rateStorageError: () => Response.json({ error: "temporary storage failure" }, { status: 503 }),
  RATE_LIMITS: { adminLoginUser: {}, adminLoginIp: {}, otpRequestPhone: {}, otpRequestIp: {}, otpVerifyPhone: {}, otpVerifyIp: {} },
}));
mock.module("@/lib/user-auth", () => ({
  findActiveOtp: async () => null,
  issueOtp: async () => ({ code: "123456" }),
  deleteActiveOtp: async () => {}, OTP_RESEND_MS: 60_000,
  verifyOtpOnly: async () => verifiedCode ? { ok: true } : { ok: false, status: 400, error: "invalid code" },
}));
mock.module("@/lib/sms", () => ({ sendOtpSms }));
const { hashPassword } = await import("@/lib/auth");
const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: verify } = await import("@/app/api/auth/login/verify/route");
passwordHash = hashPassword("test-password-with-enough-length");

beforeEach(() => {
  userWriteError = ipWriteError = readError = blocked = secondFactor = false;
  verifiedCode = true;
  create.mockClear(); hitRate.mockClear(); sendOtpSms.mockClear();
});
function request(password = "incorrect", code?: string) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test-admin", password, code }),
  });
}

for (const [label, fail] of [["account", () => { userWriteError = true; }], ["IP", () => { ipWriteError = true; }]] as const) {
  test(`login and 2FA verification return 503 when the ${label} failure counter cannot be written`, async () => {
    fail();
    expect((await login(request())).status).toBe(503);
    expect(hitRate).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
    hitRate.mockClear();
    expect((await verify(request("incorrect", "123456"))).status).toBe(503);
    expect(hitRate).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });
}
test("a normal wrong password stays 401 and is counted for both account and IP", async () => {
  expect((await login(request())).status).toBe(401);
  expect(hitRate).toHaveBeenCalledTimes(2);
  expect(create).not.toHaveBeenCalled();
});
test("an unavailable counter reader refuses login with 503", async () => {
  readError = true;
  expect((await login(request("test-password-with-enough-length"))).status).toBe(503);
  expect(create).not.toHaveBeenCalled();
});
test("a rate-limited account cannot create a session", async () => {
  blocked = true;
  expect((await login(request("test-password-with-enough-length"))).status).toBe(429);
  expect(create).not.toHaveBeenCalled();
});
test("a correct password without 2FA still creates a session", async () => {
  const response = await login(request("test-password-with-enough-length"));
  expect(response.status).toBe(200);
  expect(create).toHaveBeenCalledTimes(1);
  expect(response.headers.get("set-cookie")).toContain("avid_admin=");
});
test("2FA sends a code without a session, rejects a bad code, and logs in after verification", async () => {
  secondFactor = true;
  const response = await login(request("test-password-with-enough-length"));
  expect(await response.json()).toMatchObject({ ok: true, twoFactor: true });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(sendOtpSms).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
  verifiedCode = false;
  expect((await verify(request("test-password-with-enough-length", "000000"))).status).toBe(400);
  expect(create).not.toHaveBeenCalled();
  verifiedCode = true;
  expect((await verify(request("test-password-with-enough-length", "123456"))).status).toBe(200);
  expect(create).toHaveBeenCalledTimes(1);
});
