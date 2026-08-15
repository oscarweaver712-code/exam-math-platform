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
