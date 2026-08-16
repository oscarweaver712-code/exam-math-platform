/**
 * Serves `/media/<key>` from whichever storage backend is configured.
 *
 * Stored rows keep a stable app-relative path, so the bucket, its domain and
 * even the provider can change without a data migration:
 *
 * - S3 behind a public CDN → redirect to the CDN URL.
 * - S3 without one         → redirect to a short-lived signed URL.
 * - Local disk             → stream the file from the storage directory.
 */

import type { Express } from "express";
import {
  MEDIA_PREFIX,
  localPathFor,
  storageBackend,
  storageGetSignedUrl,
  storagePublicUrl,
} from "../storage";

/** Cache aggressively: keys carry a random suffix, so a URL never changes content. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export function registerStorageProxy(app: Express) {
  app.get(`${MEDIA_PREFIX}/*splat`, async (req, res) => {
    const rawKey = (req.params as { splat?: string | string[] }).splat;
    const key = Array.isArray(rawKey) ? rawKey.join("/") : rawKey;

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (storageBackend() === "local") {
      let absolutePath: string;
      try {
        // Throws on any key that would escape the storage root.
        absolutePath = localPathFor(key);
      } catch {
        res.status(400).send("Invalid storage key");
        return;
      }
      res.sendFile(absolutePath, { headers: { "Cache-Control": CACHE_CONTROL } }, error => {
        if (error && !res.headersSent) res.status(404).send("Not found");
      });
      return;
    }

    const publicUrl = storagePublicUrl(key);
    if (publicUrl) {
      res.redirect(302, publicUrl);
      return;
    }

    try {
      res.redirect(302, await storageGetSignedUrl(key));
    } catch (error) {
      console.error("[Storage] Failed to sign URL for", key, error);
      res.status(404).send("Not found");
    }
  });
}
