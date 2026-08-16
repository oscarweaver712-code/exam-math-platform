/**
 * Owner notifications over the Telegram Bot API.
 *
 * The same bot that signs people in delivers these, so there is no extra
 * service to configure: the owner is whoever `OWNER_OPEN_ID` names, and the
 * bot can message them as soon as they have pressed Start on it once.
 */

import { ENV } from "./env";

const TELEGRAM_API = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 10_000;

/** Telegram chat id of the owner, derived from their `users.openId`. */
function ownerChatId(): string | null {
  const openId = ENV.ownerOpenId;
  if (!openId.startsWith("tg:")) return null;
  const id = openId.slice(3).trim();
  return id || null;
}

/** Telegram parses a small HTML subset; anything user-supplied must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send the owner a message. Returns false instead of throwing: a failed
 * notification must never break the action that triggered it.
 */
export async function notifyOwner(input: {
  title: string;
  content: string;
}): Promise<boolean> {
  const chatId = ownerChatId();
  if (!ENV.telegramBotToken || !chatId) {
    console.warn(
      "[Notify] Skipped: set TELEGRAM_BOT_TOKEN and OWNER_OPEN_ID (tg:<id>) to enable owner notifications",
    );
    return false;
  }

  const text = `<b>${escapeHtml(input.title)}</b>\n\n${escapeHtml(input.content)}`;

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${ENV.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      // 403 here usually means the owner has never started a chat with the bot.
      const detail = await response.text().catch(() => response.statusText);
      console.error(`[Notify] Telegram refused the message (${response.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Notify] Failed to reach Telegram:", error);
    return false;
  }
}
