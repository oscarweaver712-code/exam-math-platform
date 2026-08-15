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
