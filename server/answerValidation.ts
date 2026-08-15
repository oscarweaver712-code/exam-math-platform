export type AnswerKind = "short_integer" | "short_decimal" | "short_text" | "manual";

export type AnswerCheckResult = {
  normalizedAnswer: string;
  isCorrect: boolean;
  feedback: string;
};

function normaliseInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return value;
  return String(parsed);
}

function normaliseDecimal(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return String(parsed);
}

export function normaliseAnswer(rawAnswer: string, answerKind: AnswerKind) {
  const compact = rawAnswer.trim().replace(/\s+/g, "");

  if (answerKind === "short_text") {
    return compact.toLocaleLowerCase("ru-RU");
  }

  const withDecimalPoint = compact.replace(/,/g, ".");

  if (answerKind === "short_integer") {
    return normaliseInteger(withDecimalPoint);
  }

  if (answerKind === "short_decimal") {
    return normaliseDecimal(withDecimalPoint);
  }

  return compact;
}

export function checkPartOneAnswer({
  rawAnswer,
  answerKind,
  correctAnswer,
  acceptableAnswers = [],
}: {
  rawAnswer: string;
  answerKind: AnswerKind;
  correctAnswer: string;
  acceptableAnswers?: string[];
}): AnswerCheckResult {
  const normalizedAnswer = normaliseAnswer(rawAnswer, answerKind);
  const validAnswers = [correctAnswer, ...acceptableAnswers].map(answer =>
    normaliseAnswer(answer, answerKind),
  );
  const isCorrect = validAnswers.includes(normalizedAnswer);

  return {
    normalizedAnswer,
    isCorrect,
    feedback: isCorrect
      ? "Верно. Ответ засчитан."
      : "Пока неверно. Проверьте ход решения и попробуйте ещё раз.",
  };
}
