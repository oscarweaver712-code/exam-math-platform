import { describe, expect, it } from "vitest";
import { aggregateByNumber, aggregateProgress } from "./progress";

describe("progress aggregation", () => {
  it("uses only the latest attempt for each task and groups by topic and KIM", () => {
    const result = aggregateProgress([
      { taskId: 1, submittedAt: 100, status: "incorrect", topic: "Уравнения", taskType: "Уравнения", kimNumber: "8" },
      { taskId: 1, submittedAt: 200, status: "correct", topic: "Уравнения", taskType: "Уравнения", kimNumber: "8" },
      { taskId: 2, submittedAt: 150, status: "incorrect", topic: "Вероятность", taskType: "Вероятность", kimNumber: "10" },
    ]);

    expect(result.byTopic).toEqual([
      { topic: "Уравнения", correct: 1, incorrect: 0, awaiting: 0 },
      { topic: "Вероятность", correct: 0, incorrect: 1, awaiting: 0 },
    ]);
    expect(result.byTaskType).toEqual([
      { kimNumber: "8", title: "Уравнения", correct: 1, incorrect: 0, awaiting: 0 },
      { kimNumber: "10", title: "Вероятность", correct: 0, incorrect: 1, awaiting: 0 },
    ]);
  });
});

describe("progress by exam number", () => {
  const totals = [
    { kimNumber: "7", title: "Числа на координатной прямой", part: "part1" as const, sortOrder: 7, total: 10 },
    { kimNumber: "20", title: "Уравнения: развёрнутый ответ", part: "part2" as const, sortOrder: 20, total: 4 },
    { kimNumber: "0", title: "Требует разбора", part: "part1" as const, sortOrder: 99, total: 0 },
  ];

  it("shows the size of a number nobody has touched", () => {
    const rows = aggregateByNumber([], totals);
    // The empty bucket is not a position of the exam and is left out entirely.
    expect(rows.map(row => row.kimNumber)).toEqual(["7", "20"]);
    expect(rows[0]).toMatchObject({ total: 10, correct: 0, untouched: 10 });
  });

  it("counts a task once, by its latest attempt", () => {
    const attempt = (taskId: number, status: "correct" | "incorrect", submittedAt: number) => ({
      taskId,
      submittedAt,
      status,
      topic: "",
      taskType: "Числа на координатной прямой",
      kimNumber: "7",
    });
    const rows = aggregateByNumber(
      [attempt(1, "incorrect", 100), attempt(1, "correct", 200), attempt(2, "incorrect", 150)],
      totals,
    );
    expect(rows[0]).toMatchObject({ correct: 1, incorrect: 1, untouched: 8 });
  });

  it("never draws a bar past the end of the bank", () => {
    const attempts = Array.from({ length: 12 }, (_, index) => ({
      taskId: index + 1,
      submittedAt: index,
      status: "correct" as const,
      topic: "",
      taskType: "Числа на координатной прямой",
      kimNumber: "7",
    }));
    const rows = aggregateByNumber(attempts, totals);
    expect(rows[0].correct).toBe(10);
    expect(rows[0].untouched).toBe(0);
  });
});
