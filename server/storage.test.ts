/**
 * Storage keys end up in URLs, so the path-safety checks here are the boundary
 * between «serve an uploaded diagram» and «serve /etc/passwd». The local
 * backend is the one that can be traversed, so it gets the attention.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tempRoot: string;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "school911-storage-"));
  process.env.STORAGE_DIR = tempRoot;
  // Make sure no ambient S3 config leaks in and switches the backend.
  delete process.env.S3_BUCKET;
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("storage (local backend)", () => {
  it("defaults to local disk when S3 is not configured", async () => {
    const { storageBackend } = await import("./storage");
    expect(storageBackend()).toBe("local");
  });

  it("writes a file and returns an app-relative URL", async () => {
    const { storagePut, localPathFor, MEDIA_PREFIX } = await import("./storage");
    const { key, url } = await storagePut("tasks/diagram.png", Buffer.from("png-bytes"), "image/png");

    expect(url).toBe(`${MEDIA_PREFIX}/${key}`);
    // Never a bucket URL: the backend must be swappable without a data migration.
    expect(url.startsWith("/media/")).toBe(true);
    expect(fs.readFileSync(localPathFor(key), "utf-8")).toBe("png-bytes");
  });

  it("gives two uploads of the same name distinct keys", async () => {
    const { storagePut } = await import("./storage");
    const first = await storagePut("tasks/same.png", Buffer.from("a"));
    const second = await storagePut("tasks/same.png", Buffer.from("b"));
    expect(first.key).not.toBe(second.key);
  });

  it("deletes a file", async () => {
    const { storagePut, storageDelete, localPathFor } = await import("./storage");
    const { key } = await storagePut("tasks/gone.png", Buffer.from("x"));
    await storageDelete(key);
    expect(fs.existsSync(localPathFor(key))).toBe(false);
  });

  it("has no public URL without a CDN configured", async () => {
    const { storagePublicUrl } = await import("./storage");
    expect(storagePublicUrl("tasks/a.png")).toBeNull();
  });

  it("refuses signed URLs on the local backend", async () => {
    const { storageGetSignedUrl } = await import("./storage");
    await expect(storageGetSignedUrl("tasks/a.png")).rejects.toThrow(/S3 backend/);
  });

  describe("rejects keys that would escape the storage root", () => {
    const hostile = ["../secrets.env", "tasks/../../secrets.env", "C:\\Windows\\win.ini", "", "//"];

    for (const key of hostile) {
      it(JSON.stringify(key), async () => {
        const { localPathFor } = await import("./storage");
        expect(() => localPathFor(key)).toThrow(/Invalid storage key/);
      });
    }
  });

  describe("contains keys that only look absolute", () => {
    // A leading slash is stripped rather than rejected, so `/etc/passwd`
    // becomes `<root>/etc/passwd` — harmless, and never the real /etc/passwd.
    const sanitised = ["/etc/passwd", "///tasks/a.png"];

    for (const key of sanitised) {
      it(JSON.stringify(key), async () => {
        const { localPathFor } = await import("./storage");
        const resolved = localPathFor(key);
        expect(resolved.startsWith(path.resolve(tempRoot) + path.sep)).toBe(true);
        expect(resolved).not.toBe("/etc/passwd");
      });
    }
  });

  it("keeps a resolved path inside the storage root", async () => {
    const { storagePut, localPathFor } = await import("./storage");
    const { key } = await storagePut("nested/deep/file.png", Buffer.from("x"));
    // Compare against the unresolved root: on macOS the temp dir is behind a
    // /var -> /private/var symlink, and the code never calls realpath.
    expect(localPathFor(key).startsWith(path.resolve(tempRoot) + path.sep)).toBe(true);
  });
});
