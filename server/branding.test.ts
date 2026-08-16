import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APPROVED_TITLE = "Школа 911";

describe("application branding configuration", () => {
  it("uses the approved project title in the document and runtime configuration", async () => {
    const html = await readFile(resolve(process.cwd(), "client/index.html"), "utf8");

    expect(html).toContain(`<title>${APPROVED_TITLE}`);

    const configuredTitle = process.env.VITE_APP_TITLE?.trim();
    if (configuredTitle) {
      expect(configuredTitle).toBe(APPROVED_TITLE);
    }
  });
});
