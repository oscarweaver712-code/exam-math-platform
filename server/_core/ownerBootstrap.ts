/**
 * First-login ownership claim.
 *
 * `OWNER_OPEN_ID` needs a numeric Telegram id, which is awkward to find before
 * you have ever logged in. `OWNER_TELEGRAM_USERNAME` lets the owner be named by
 * their handle instead, and the first login that matches it writes a permanent
 * `owner` row keyed by the numeric id.
 *
 * The username is a bootstrap key, never a standing credential: Telegram
 * handles can be released and re-registered by someone else, so once an owner
 * row exists the username stops granting anything. That keeps the convenience
 * of a handle without leaving a permanent way to impersonate the owner.
 */

import { eq } from "drizzle-orm";
import { editorialAccessRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";

export type OwnershipClaim =
  | { claimed: true; openId: string }
  | { claimed: false; reason: string };

export async function claimOwnershipOnFirstLogin(
  openId: string,
  username: string | null,
): Promise<OwnershipClaim> {
  const configured = ENV.ownerTelegramUsername;
  if (!configured) return { claimed: false, reason: "no OWNER_TELEGRAM_USERNAME configured" };
  if (!username || username.toLowerCase() !== configured) {
    return { claimed: false, reason: "username does not match" };
  }

  // `OWNER_OPEN_ID` already pins an owner; the handle must not override it.
  if (ENV.ownerOpenId && ENV.ownerOpenId !== openId) {
    return { claimed: false, reason: "OWNER_OPEN_ID already pins a different account" };
  }

  const db = await getDb();
  if (!db) return { claimed: false, reason: "database unavailable" };

  const existingOwners = await db
    .select({ id: editorialAccessRoles.id, userId: editorialAccessRoles.userId })
    .from(editorialAccessRoles)
    .where(eq(editorialAccessRoles.role, "owner"))
    .limit(1);

  if (existingOwners.length > 0) {
    return { claimed: false, reason: "an owner already exists" };
  }

  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!user) return { claimed: false, reason: "user row not found" };

  const timestamp = Date.now();
  await db.insert(editorialAccessRoles).values({
    userId: user.id,
    role: "owner",
    isActive: true,
    grantedByUserId: user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  console.log(
    `[Auth] Ownership claimed by @${username} (${openId}). ` +
      `Pin it by setting OWNER_OPEN_ID=${openId}.`,
  );

  return { claimed: true, openId };
}
