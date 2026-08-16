import { describe, expect, it } from "vitest";
import { checkPartOneAnswer, normaliseAnswer } from "./answerValidation";

describe("answer validation for Part 1", () => {
  it("normalises equivalent integer input", () => {
    expect(normaliseAnswer(" 007 ", "short_integer")).toBe("7");
    expect(
      checkPartOneAnswer({
        rawAnswer: "007",
        answerKind: "short_integer",
        correctAnswer: "7",
      }).isCorrect,
    ).toBe(true);
  });

  it("accepts comma and dot decimal representations", () => {
    expect(
      checkPartOneAnswer({
        rawAnswer: "0,60",
        answerKind: "short_decimal",
        correctAnswer: "0.6",
      }).isCorrect,
    ).toBe(true);
  });

  it("treats a numeric short_text answer as a number, not a string", () => {
    // Imported ФИПИ tasks carry no answer kind, so numeric keys land in
    // short_text; a learner typing the Russian decimal comma must still pass.
    for (const [typed, key] of [["1,8", "1.8"], ["1.8", "1,8"], ["0,60", "0.6"], ["007", "7"]]) {
      expect(
        checkPartOneAnswer({ rawAnswer: typed, answerKind: "short_text", correctAnswer: key }).isCorrect,
      ).toBe(true);
    }
  });

  it("still rejects a different number", () => {
    expect(
      checkPartOneAnswer({ rawAnswer: "1,9", answerKind: "short_text", correctAnswer: "1.8" }).isCorrect,
    ).toBe(false);
  });

  it("checks text answers without case or spacing noise", () => {
    expect(
      checkPartOneAnswer({
        rawAnswer: "  Да ",
        answerKind: "short_text",
        correctAnswer: "да",
      }).isCorrect,
    ).toBe(true);
  });
});
