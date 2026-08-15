import { describe, expect, it } from "vitest";
import { aggregateProgress } from "./progress";

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
