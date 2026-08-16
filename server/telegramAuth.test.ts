/**
 * The Telegram login payload is fully attacker-controlled until its signature
 * is checked, so these cases are the boundary between «anyone» and «signed in
 * as the owner». They cover forgery, replay, and the malformed input a real
 * attacker sends before trying anything clever.
 */

import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_AUTH_AGE_MS,
  TelegramAuthError,
  toOpenId,
  verifyTelegramLogin,
} from "./_core/telegram";

const BOT_TOKEN = "123456:AAF-test-bot-token";

function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const checkString = Object.keys(fields)
    .filter(key => key !== "hash")
    .sort()
    .map(key => `${key}=${fields[key]}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  return crypto.createHmac("sha256", secret).update(checkString).digest("hex");
}

function payload(overrides: Record<string, string> = {}, token = BOT_TOKEN) {
  const fields: Record<string, string> = {
    id: "987654321",
    first_name: "Валерий",
    last_name: "Иванов",
    username: "yavalerachestno",
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
  return { ...fields, hash: sign(fields, token) };
}

describe("verifyTelegramLogin", () => {
  it("accepts a correctly signed payload", () => {
    const identity = verifyTelegramLogin(payload(), BOT_TOKEN);
    expect(identity.telegramId).toBe("987654321");
    expect(identity.openId).toBe("tg:987654321");
    expect(identity.name).toBe("Валерий Иванов");
    expect(identity.username).toBe("yavalerachestno");
  });

  it("rejects a payload signed with a different bot token", () => {
    const forged = payload({}, "999999:AAF-attacker-token");
    expect(() => verifyTelegramLogin(forged, BOT_TOKEN)).toThrow(TelegramAuthError);
  });

  it("rejects a payload whose fields were altered after signing", () => {
    // The classic attack: keep a real signature, swap the account id.
    const tampered = { ...payload(), id: "1" };
    expect(() => verifyTelegramLogin(tampered, BOT_TOKEN)).toThrow(TelegramAuthError);
  });

  it("rejects a payload with no hash", () => {
    const { hash, ...unsigned } = payload();
    void hash;
    expect(() => verifyTelegramLogin(unsigned, BOT_TOKEN)).toThrow(/no hash/);
  });

  it("rejects a hash that is not hex of the right length", () => {
    expect(() => verifyTelegramLogin({ ...payload(), hash: "zz" }, BOT_TOKEN)).toThrow(
      TelegramAuthError,
    );
  });

  it("rejects a replayed payload older than the freshness window", () => {
    const stale = Math.floor((Date.now() - MAX_AUTH_AGE_MS - 60_000) / 1000);
    expect(() => verifyTelegramLogin(payload({ auth_date: String(stale) }), BOT_TOKEN)).toThrow(
      /expired/,
    );
  });

  it("accepts a payload from just inside the freshness window", () => {
    const recent = Math.floor((Date.now() - MAX_AUTH_AGE_MS + 60_000) / 1000);
    expect(verifyTelegramLogin(payload({ auth_date: String(recent) }), BOT_TOKEN).telegramId).toBe(
      "987654321",
    );
  });

  it("rejects an auth_date far in the future", () => {
    const future = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
    expect(() => verifyTelegramLogin(payload({ auth_date: String(future) }), BOT_TOKEN)).toThrow(
      /future/,
    );
  });

  it("tolerates small clock skew", () => {
    const slightlyAhead = Math.floor((Date.now() + 60_000) / 1000);
    expect(() =>
      verifyTelegramLogin(payload({ auth_date: String(slightlyAhead) }), BOT_TOKEN),
    ).not.toThrow();
  });

  it("refuses to verify anything when no bot token is configured", () => {
    // Otherwise an unconfigured deploy would authenticate every request.
    expect(() => verifyTelegramLogin(payload(), "")).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("requires id and auth_date", () => {
    const fields = { first_name: "Аноним" };
    expect(() =>
      verifyTelegramLogin({ ...fields, hash: sign(fields) }, BOT_TOKEN),
    ).toThrow(/id or auth_date/);
  });

  it("falls back to the username when the account has no first name", () => {
    const identity = verifyTelegramLogin(
      payload({ first_name: "", last_name: "", username: "solo" }),
      BOT_TOKEN,
    );
    expect(identity.name).toBe("solo");
  });

  it("ignores nested objects that could smuggle fields past the check string", () => {
    const signed = payload();
    const identity = verifyTelegramLogin(
      { ...signed, extra: { role: "admin" } } as Record<string, unknown>,
      BOT_TOKEN,
    );
    expect(identity.openId).toBe("tg:987654321");
  });
});

describe("toOpenId", () => {
  it("namespaces the provider so other login methods can coexist", () => {
    expect(toOpenId(42)).toBe("tg:42");
    expect(toOpenId("42")).toBe("tg:42");
  });
});
