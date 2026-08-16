/**
 * Object storage on any S3-compatible service (Cloudflare R2 by default).
 *
 * Keys are returned to callers as `/media/<key>` rather than a bucket URL, so
 * the storage backend can change without rewriting rows in `task_visuals`.
 * `registerStorageProxy` resolves that path at request time: it redirects to
 * the public CDN URL when the bucket is public, and to a short-lived signed
 * URL when it is not.
 */

import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

/** Public path prefix served by `registerStorageProxy`. */
export const MEDIA_PREFIX = "/media";

let client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(
    ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey && ENV.s3Endpoint,
  );
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Storage is not configured: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  }
  if (!client) {
    client = new S3Client({
      region: ENV.s3Region || "auto",
      endpoint: ENV.s3Endpoint,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
      // R2 and most S3 clones require path-style addressing.
      forcePathStyle: true,
    });
  }
  return client;
}

function normalizeKey(relKey: string): string {
  const trimmed = relKey.replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..")) {
    throw new Error(`Invalid storage key: ${relKey}`);
  }
  return trimmed;
}

/** Keep uploads with the same filename from overwriting each other. */
function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

  await getClient().send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { key, url: `${MEDIA_PREFIX}/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `${MEDIA_PREFIX}/${key}` };
}

/** Time-limited direct URL, used when the bucket is not publicly readable. */
export async function storageGetSignedUrl(
  relKey: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const key = normalizeKey(relKey);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  await getClient().send(
    new DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
  );
}

/** Public URL when the bucket is served by a CDN, otherwise null. */
export function storagePublicUrl(relKey: string): string | null {
  if (!ENV.s3PublicUrl) return null;
  return `${ENV.s3PublicUrl.replace(/\/+$/, "")}/${normalizeKey(relKey)}`;
}
