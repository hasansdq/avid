import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { streamIceConfig } from "../src/lib/stream-ice";

test("TURN credentials use Coturn REST HMAC, expire and never expose the shared secret", () => {
  const secret = "test-only-".repeat(8);
  const c = streamIceConfig("room:fixture", 1700000000000, {
    STREAM_TURN_URLS: "turn:turn.example.org:3478?transport=udp,turns:turn.example.org:5349?transport=tcp",
    STREAM_TURN_SECRET: secret, STREAM_TURN_TTL_SECONDS: "3600",
  });
  const relay = c.iceServers[1];
  expect(c.turnConfigured).toBe(true); expect(c.expiresAt).toBe(1700003600000);
  expect(relay.username!.startsWith("1700003600:")).toBe(true);
  expect(relay.credential).toBe(createHmac("sha1", secret).update(relay.username!).digest("base64"));
  expect(JSON.stringify(c)).not.toContain(secret);
  expect(streamIceConfig("room:fixture", 1700000000000, {
    STREAM_TURN_URLS: "turn:turn.example.org", STREAM_TURN_SECRET: secret,
  }).iceServers[1].username).not.toBe(relay.username);
});
test("unconfigured TURN preserves direct mode and reports relay unavailable", () => {
  const c = streamIceConfig("test", 0, {});
  expect(c.turnConfigured).toBe(false); expect(c.iceTransportPolicy).toBe("all");
  expect(c.iceServers).toHaveLength(1);
});
test("bad ICE config fails clearly rather than leaking a secret or issuing unusable credentials", () => {
  for (const env of [
    { STREAM_TURN_URLS: "https://bad" },
    { STREAM_TURN_URLS: "turn:valid", STREAM_TURN_SECRET: "short" },
    { STREAM_ICE_TRANSPORT_POLICY: "relay" },
    { STREAM_TURN_TTL_SECONDS: "NaN" },
    { STREAM_TURN_TTL_SECONDS: "999999" },
  ]) expect(() => streamIceConfig("test", 0, env)).toThrow();
});
