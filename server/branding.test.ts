import { describe, expect, it } from "vitest";

describe("application branding configuration", () => {
  it("uses the approved project title", () => {
    expect(process.env.VITE_APP_TITLE).toBe("Школа 911");
  });
});
