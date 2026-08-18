export type ProgressAttempt = {
  taskId: number;
  submittedAt: number;
  status: "awaiting_review" | "correct" | "incorrect" | "reviewed";
  topic: string;
  taskType: string;
  kimNumber: string;
};

type ProgressCounters = { correct: number; incorrect: number; awaiting: number };

function addAttempt(counters: ProgressCounters, status: ProgressAttempt["status"]) {
  if (status === "correct") counters.correct += 1;
  else if (status === "incorrect") counters.incorrect += 1;
  else counters.awaiting += 1;
}

export function aggregateProgress(attempts: ProgressAttempt[]) {
  const latestByTask = new Map<number, ProgressAttempt>();
  [...attempts]
    .sort((first, second) => second.submittedAt - first.submittedAt)
    .forEach(attempt => {
      if (!latestByTask.has(attempt.taskId)) latestByTask.set(attempt.taskId, attempt);
    });

  const byTopic = new Map<string, ProgressCounters>();
  const byTaskType = new Map<string, { title: string } & ProgressCounters>();

  for (const attempt of Array.from(latestByTask.values())) {
    const topicCounters = byTopic.get(attempt.topic) ?? { correct: 0, incorrect: 0, awaiting: 0 };
    addAttempt(topicCounters, attempt.status);
    byTopic.set(attempt.topic, topicCounters);

    const typeCounters = byTaskType.get(attempt.kimNumber) ?? { title: attempt.taskType, correct: 0, incorrect: 0, awaiting: 0 };
    addAttempt(typeCounters, attempt.status);
    byTaskType.set(attempt.kimNumber, typeCounters);
  }

  return {
    byTopic: Array.from(byTopic.entries()).map(([topic, values]) => ({ topic, ...values })),
    byTaskType: Array.from(byTaskType.entries()).map(([kimNumber, values]) => ({ kimNumber, ...values })),
  };
}

export type NumberTotals = { kimNumber: string; title: string; part: "part1" | "part2"; sortOrder: number; total: number };

/**
 * Progress laid out the way the exam is: one row per number, 1 to 25.
 *
 * The bank's whole point is that ФИПИ does not sort by number, so this is the
 * screen where that work becomes visible to a student — how much of задание 7
 * is behind them, and how much of it there is at all. Totals come from the bank
 * and attempts from the learner, which is why they arrive separately: a number
 * nobody has touched still has to show its size.
 */
export function aggregateByNumber(attempts: ProgressAttempt[], totals: NumberTotals[]) {
  const latestByTask = new Map<number, ProgressAttempt>();
  [...attempts]
    .sort((first, second) => second.submittedAt - first.submittedAt)
    .forEach(attempt => {
      if (!latestByTask.has(attempt.taskId)) latestByTask.set(attempt.taskId, attempt);
    });

  const seen = new Map<string, ProgressCounters>();
  for (const attempt of Array.from(latestByTask.values())) {
    const counters = seen.get(attempt.kimNumber) ?? { correct: 0, incorrect: 0, awaiting: 0 };
    addAttempt(counters, attempt.status);
    seen.set(attempt.kimNumber, counters);
  }

  return totals
    .filter(row => row.total > 0)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map(row => {
      const counters = seen.get(row.kimNumber) ?? { correct: 0, incorrect: 0, awaiting: 0 };
      const touched = counters.correct + counters.incorrect + counters.awaiting;
      return {
        kimNumber: row.kimNumber,
        title: row.title,
        part: row.part,
        total: row.total,
        // Attempts can outlive the task that carried them; never report more
        // solved than the bank holds, or the bar draws past its own end.
        correct: Math.min(counters.correct, row.total),
        incorrect: counters.incorrect,
        awaiting: counters.awaiting,
        untouched: Math.max(0, row.total - touched),
      };
    });
}
