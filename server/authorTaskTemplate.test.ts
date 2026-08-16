import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("author task template contracts", () => {
  it("generates immutable IDs server-side and does not update them", async () => {
    const source = await readFile(resolve(process.cwd(), "server/routers/school.ts"), "utf8");
    const updateTaskSection = source.slice(source.indexOf("updateTask: adminProcedure"), source.indexOf("archiveTask: adminProcedure"));

    expect(source).toContain('const IMMUTABLE_TASK_ID_PREFIX = "SH911-OGE"');
    expect(source).toContain("const createImmutableTaskId");
    expect(source).toContain("const internalId = createImmutableTaskId();");
    expect(source).toContain('sourceKind: z.enum(["author", "fipi", "partner"])');
    expect(updateTaskSection).not.toContain("internalId:");
  });

  it("keeps explicitly marked author samples and their own visual aids in the seed workflow", async () => {
    const source = await readFile(resolve(process.cwd(), "server/ogeSeed.ts"), "utf8");

    expect(source).toContain("AUTHOR_TEMPLATE_SAMPLES");
    expect(source).toContain("Авторская тренировочная задача Школы 911");
    expect(source).toContain("author-sample-function-graph");
    expect(source).toContain("author-sample-triangle");
    expect(source).toContain("function-line-3x-minus-2");
    expect(source).toContain("triangle-angle-48-67");
  });
});
