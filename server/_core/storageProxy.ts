/**
 * Serves `/media/<key>` from object storage.
 *
 * Stored rows keep a stable app-relative path, so the bucket, its domain and
 * even the provider can change without a data migration. When the bucket sits
 * behind a public CDN we redirect straight to it; otherwise we mint a
 * short-lived signed URL per request.
 */

import type { Express } from "express";
import { isStorageConfigured, storageGetSignedUrl, storagePublicUrl } from "../storage";
import { MEDIA_PREFIX } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get(`${MEDIA_PREFIX}/*splat`, async (req, res) => {
    const rawKey = (req.params as { splat?: string | string[] }).splat;
    const key = Array.isArray(rawKey) ? rawKey.join("/") : rawKey;

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    // Path traversal guard: keys are opaque and never contain `..`.
    if (key.includes("..")) {
      res.status(400).send("Invalid storage key");
      return;
    }
    if (!isStorageConfigured()) {
      res.status(500).send("Storage is not configured");
      return;
    }

    const publicUrl = storagePublicUrl(key);
    if (publicUrl) {
      // Permanent location, but keep the app path canonical for callers.
      res.redirect(302, publicUrl);
      return;
    }

    try {
      const signed = await storageGetSignedUrl(key);
      res.redirect(302, signed);
    } catch (error) {
      console.error("[Storage] Failed to sign URL for", key, error);
      res.status(404).send("Not found");
    }
  });
}
