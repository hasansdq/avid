import { createHmac, randomBytes } from "node:crypto";

/** Server only: the shared secret never leaves this module. */
export function streamIceConfig(subject: string, now = Date.now(), env: Record<string, string | undefined> = process.env) {
  const stunUrls = (env.STREAM_STUN_URLS ?? "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const turnUrls = (env.STREAM_TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (stunUrls.some((u) => !/^stuns?:[^\s/@]+$/i.test(u)) ||
      turnUrls.some((u) => !/^turns?:[^\s/@]+(?:\?transport=(?:udp|tcp))?$/i.test(u))) {
    throw new Error("Invalid stream ICE server URL");
  }
  const secret = env.STREAM_TURN_SECRET?.trim();
  if (turnUrls.length && (!secret || secret.length < 32)) {
    throw new Error("STREAM_TURN_SECRET must contain at least 32 characters");
  }
  const requestedTtl = Number(env.STREAM_TURN_TTL_SECONDS ?? 3600);
  if (!Number.isFinite(requestedTtl) || requestedTtl < 600 || requestedTtl > 43200) {
    throw new Error("STREAM_TURN_TTL_SECONDS must be between 600 and 43200");
  }
  const expiresAt = now + Math.floor(requestedTtl) * 1000;
  const iceServers: RTCIceServer[] = stunUrls.length ? [{ urls: stunUrls }] : [];
  if (turnUrls.length && secret) {
    // Coturn TURN REST authentication: expiry:user + base64(HMAC-SHA1).
    const identity = createHmac("sha256", secret).update(subject).digest("hex").slice(0, 16);
    const username = `${Math.floor(expiresAt / 1000)}:${identity}:${randomBytes(6).toString("hex")}`;
    iceServers.push({ urls: turnUrls, username,
      credential: createHmac("sha1", secret).update(username).digest("base64") });
  }
  if (env.STREAM_ICE_TRANSPORT_POLICY && !["all", "relay"].includes(env.STREAM_ICE_TRANSPORT_POLICY))
    throw new Error("STREAM_ICE_TRANSPORT_POLICY must be all or relay");
  const iceTransportPolicy = env.STREAM_ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all";
  if (iceTransportPolicy === "relay" && !turnUrls.length) throw new Error("Relay policy requires TURN");
  return { iceServers, iceTransportPolicy, turnConfigured: turnUrls.length > 0, expiresAt };
}
