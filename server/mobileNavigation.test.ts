import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("site-wide mobile navigation", () => {
  it("keeps public, cabinet and administrative destinations in the global header drawer", async () => {
    const source = await readFile(resolve(process.cwd(), "client/src/components/PlatformHeader.tsx"), "utf8");

    expect(source).toContain('title: "Основное"');
    expect(source).toContain('href: "/bank"');
    expect(source).toContain('href: "/variants"');
    expect(source).toContain('href: "/subjects"');
    expect(source).toContain('title: "Кабинет"');
    expect(source).toContain('href: "/workspace"');
    expect(source).toContain('href: "/settings"');
    expect(source).toContain('title: "Управление"');
    expect(source).toContain('href: "/admin/access"');
    expect(source).toContain('Разделы школы');
  });
});
