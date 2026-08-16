export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Where to send the visitor after a successful login. */
export const LOGIN_PATH = "/login";

/**
 * Send the visitor to the login page, remembering where they were.
 *
 * Sign-in itself happens on `/login` through the Telegram Login Widget, which
 * has to render its own button — Telegram will not accept a plain link. Call
 * this from an event handler or effect, never during render.
 */
export const startLogin = (returnTo?: string) => {
  // Guard against `onClick={startLogin}`, which would pass a MouseEvent here.
  const explicit = typeof returnTo === "string" ? returnTo : undefined;
  const target = explicit ?? `${window.location.pathname}${window.location.search}`;
  const url = new URL(LOGIN_PATH, window.location.origin);
  if (target && target !== LOGIN_PATH) {
    url.searchParams.set("returnTo", target);
  }
  window.location.href = url.toString();
};
