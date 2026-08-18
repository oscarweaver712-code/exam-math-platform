import { describe, expect, it } from "vitest";
import { SOLUTION_PLACEHOLDER, isSolutionMissing } from "@shared/const";

describe("what counts as a task still waiting for a разбор", () => {
  it("recognises the placeholder the importer writes", () => {
    expect(isSolutionMissing(SOLUTION_PLACEHOLDER)).toBe(true);
    expect(isSolutionMissing("")).toBe(true);
    expect(isSolutionMissing(null)).toBe(true);
  });

  it("leaves a written разбор alone, even a short one", () => {
    expect(isSolutionMissing("Площадь ромба — половина произведения диагоналей.")).toBe(false);
    // An editor who kept the placeholder's opening line and wrote below it has
    // still not written a разбор; the queue must keep offering the task.
    expect(isSolutionMissing(`${SOLUTION_PLACEHOLDER}\n\nПочти написал.`)).toBe(true);
  });

  it("matches what the SQL side compares", () => {
    // The queue filters in MySQL with LEFT(solutionMarkdown, 24); if that
    // prefix ever stops being the whole first line, the two disagree and the
    // queue starts hiding work.
    expect(SOLUTION_PLACEHOLDER.slice(0, 24)).toBe("_Разбор ещё не написан._");
  });
});
