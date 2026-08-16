/**
 * Login and logout endpoints.
 *
 * The Telegram widget can hand its payload back two ways; both land here:
 *
 * - `data-auth-url` → the browser is redirected to `GET /api/auth/telegram`
 *   with the signed fields as query parameters.
 * - `data-onauth`   → the page posts the same fields as JSON to the same path.
 *
 * Either way the payload is untrusted until `verifyTelegramLogin` accepts it.
 */

import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { signSession } from "./auth";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { TelegramAuthError, verifyTelegramLogin } from "./telegram";

/** Only allow redirects back into this app, never to an attacker's host. */
function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/")) return "/";
  // `//evil.com` and `/\evil.com` are protocol-relative URLs, not local paths.
  if (target.startsWith("//") || target.startsWith("/\\")) return "/";
  return target;
}

export function registerAuthRoutes(app: Express) {
  const handleTelegramLogin = async (req: Request, res: Response) => {
    const payload = req.method === "POST" ? req.body : req.query;

    try {
      const identity = verifyTelegramLogin(
        (payload ?? {}) as Record<string, unknown>,
        ENV.telegramBotToken,
      );

      await db.upsertUser({
        openId: identity.openId,
        name: identity.name,
        loginMethod: "telegram",
        lastSignedIn: new Date(),
      });

      const token = await signSession({
        openId: identity.openId,
        name: identity.name,
      });

      res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });

      if (req.method === "POST") {
        res.json({ ok: true, redirectTo: safeRedirect(req.body?.redirectTo) });
        return;
      }
      res.redirect(safeRedirect(req.query.redirectTo));
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        // Do not echo the payload back: it is attacker-controlled input.
        console.warn("[Auth] Telegram login rejected:", error.message);
        res.status(403).json({ error: "Не удалось подтвердить вход через Telegram" });
        return;
      }
      console.error("[Auth] Telegram login failed:", error);
      res.status(500).json({ error: "Вход временно недоступен" });
    }
  };

  app.get("/api/auth/telegram", handleTelegramLogin);
  app.post("/api/auth/telegram", handleTelegramLogin);

  // The widget needs the bot username, and the client needs to know whether
  // login is configured at all so it can show a useful message instead of a
  // dead button.
  app.get("/api/auth/config", (_req, res) => {
    res.json({
      provider: "telegram",
      botUsername: ENV.telegramBotUsername || null,
      configured: Boolean(ENV.telegramBotToken && ENV.telegramBotUsername),
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
    res.json({ ok: true });
  });
}
