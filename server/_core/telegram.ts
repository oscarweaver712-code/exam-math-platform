/**
 * Telegram Login Widget verification.
 *
 * The widget hands the browser a signed payload and the browser passes it to
 * us. Telegram never calls our server, so the signature is the only thing that
 * makes the payload trustworthy — everything in it is attacker-controlled until
 * `verifyTelegramLogin` returns.
 *
 * Signature scheme (https://core.telegram.org/widgets/login#checking-authorization):
 *
 *   secret        = SHA256(bot_token)
 *   check_string  = "key=value" for every field except `hash`, sorted by key,
 *                   joined with "\n"
 *   expected_hash = HMAC_SHA256(check_string, secret)
 *
 * `auth_date` is checked too: a valid signature stays valid forever, so without
 * a freshness window a leaked payload would be a permanent credential.
 */

import crypto from "node:crypto";

/** Fields the widget sends. Everything except `id`, `auth_date` and `hash` is optional. */
export type TelegramLoginPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

export type TelegramIdentity = {
  telegramId: string;
  /** Stable primary key for `users.openId`. */
  openId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
};

/** How long a signed widget payload stays acceptable. */
export const MAX_AUTH_AGE_MS = 24 * 60 * 60 * 1000;

export class TelegramAuthError extends Error {}

function checkString(payload: Record<string, string>): string {
  return Object.keys(payload)
    .filter(key => key !== "hash")
    .sort()
    .map(key => `${key}=${payload[key]}`)
    .join("\n");
}

/**
 * Validate a widget payload and return the identity it proves.
 *
 * @throws {TelegramAuthError} when the payload is malformed, unsigned, signed
 * with the wrong bot token, or too old.
 */
export function verifyTelegramLogin(
  raw: Record<string, unknown>,
  botToken: string,
  now: number = Date.now(),
): TelegramIdentity {
  if (!botToken) {
    throw new TelegramAuthError("TELEGRAM_BOT_TOKEN is not configured");
  }

  // Normalise to strings: the payload arrives as query parameters or JSON, and
  // the check string must be rebuilt exactly as Telegram signed it.
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") continue;
    fields[key] = String(value);
  }

  const hash = fields.hash;
  if (!hash) {
    throw new TelegramAuthError("payload has no hash");
  }
  if (!fields.id || !fields.auth_date) {
    throw new TelegramAuthError("payload is missing id or auth_date");
  }

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(checkString(fields))
    .digest("hex");

  // Constant-time compare; `hash` is attacker-supplied so its length is too.
  const expectedBuffer = Buffer.from(expected, "hex");
  let providedBuffer: Buffer;
  try {
    providedBuffer = Buffer.from(hash, "hex");
  } catch {
    throw new TelegramAuthError("hash is not valid hex");
  }
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new TelegramAuthError("signature does not match");
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new TelegramAuthError("auth_date is not a number");
  }
  const ageMs = now - authDate * 1000;
  if (ageMs > MAX_AUTH_AGE_MS) {
    throw new TelegramAuthError("login payload has expired");
  }
  // A little clock skew is normal; a payload from the far future is not.
  if (ageMs < -5 * 60 * 1000) {
    throw new TelegramAuthError("auth_date is in the future");
  }

  const name = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();

  return {
    telegramId: fields.id,
    openId: toOpenId(fields.id),
    name: name || fields.username || `id${fields.id}`,
    username: fields.username ?? null,
    photoUrl: fields.photo_url ?? null,
  };
}

/** `users.openId` for a Telegram account. Namespaced so other providers can coexist. */
export function toOpenId(telegramId: string | number): string {
  return `tg:${telegramId}`;
}
