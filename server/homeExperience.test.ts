import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getHomeActions } from "../client/src/lib/homeActions";

describe("home page learning experience", () => {
  it("uses the learning role for the primary action and describes the real task formats", async () => {
    const home = await readFile(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const banner = await readFile(resolve(process.cwd(), "client/src/components/TutorTelegramBanner.tsx"), "utf8");
    const bank = await readFile(resolve(process.cwd(), "client/src/pages/TaskBank.tsx"), "utf8");
    const detail = await readFile(resolve(process.cwd(), "client/src/pages/TaskDetail.tsx"), "utf8");

    expect(home).toContain("trpc.profile.me.useQuery");
    expect(home).toContain("Часть 1 — краткий ответ");
    expect(home).toContain("Часть 2 — развёрнутый разбор");
    expect(banner).toContain("max-h-[200px]");
    expect(bank).toContain("Часть 2: развёрнутое решение и фото");
    expect(detail).toContain("Часть 2: развёрнутое решение");
  });

  it("sends each role to its relevant primary workflow", () => {
    expect(getHomeActions(false).primary).toMatchObject({ href: "/bank", label: "Начать решать" });
    expect(getHomeActions(true, "unselected").primary).toMatchObject({ href: "/workspace", label: "Выбрать роль" });
    expect(getHomeActions(true, "student").primary).toMatchObject({ href: "/bank", label: "Решать задания" });
    expect(getHomeActions(true, "tutor").primary).toMatchObject({ href: "/tutor", label: "Добавить задание" });
  });
});
