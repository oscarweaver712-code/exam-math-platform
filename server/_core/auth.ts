/**
 * Session handling for «Школа 911».
 *
 * Sessions were already self-contained before the move off Manus: a HS256 JWT
 * signed with `JWT_SECRET`, carried in a first-party cookie. Only the identity
 * handshake was platform-specific, so this module keeps the session mechanics
 * verbatim and swaps the identity provider for the Telegram Login Widget.
 *
 * `authenticateRequest` keeps its old contract — it resolves to a row of
 * `users` or throws — so tRPC context, procedures and routers are untouched.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  name: string;
};

function sessionSecret(): Uint8Array {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signSession(
  payload: SessionPayload,
  options: { expiresInMs?: number } = {},
): Promise<string> {
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
  return new SignJWT({ openId: payload.openId, name: payload.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(sessionSecret());
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
    });
    const openId = payload.openId;
    if (typeof openId !== "string" || !openId) return null;
    return {
      openId,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    // Expired, tampered with, or signed by a previous JWT_SECRET.
    return null;
  }
}

function readSessionToken(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const fromCookie = cookies[COOKIE_NAME];
  if (fromCookie) return fromCookie;

  // Fallback for browsers that drop cookies in embedded contexts.
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return undefined;
}

/**
 * Resolve the signed-in user for a request.
 *
 * @throws {ForbiddenError} when there is no valid session or the account named
 * by it no longer exists. Public procedures call this inside a try/catch and
 * treat the throw as «anonymous».
 */
export async function authenticateRequest(req: Request): Promise<User> {
  const session = await verifySession(readSessionToken(req));
  if (!session) {
    throw ForbiddenError("Invalid session cookie");
  }

  const user = await db.getUserByOpenId(session.openId);
  if (!user) {
    // The session outlived its account — treat it as signed out rather than
    // silently recreating a user the owner may have removed on purpose.
    throw ForbiddenError("User not found");
  }

  await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
  return user;
}

/** True when the request carries the shared secret used by scheduled jobs. */
export function isAuthorizedCronRequest(req: Request): boolean {
  const configured = ENV.cronSecret;
  if (!configured) return false;
  const header = req.headers["x-cron-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  return typeof provided === "string" && provided === configured;
}
