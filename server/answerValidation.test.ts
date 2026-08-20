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


describe("an answer an editor typed grades a student the same way", () => {
  it("accepts the student's spelling of a key the editor entered", () => {
    // The admin answer screen stores exactly what the editor types; the grader
    // and the screen's preview share this normaliser, so «13.5» entered by the
    // editor accepts «13,5» from the student.
    const editorKey = "13.5";
    expect(
      checkPartOneAnswer({ rawAnswer: "13,5", answerKind: "short_text", correctAnswer: editorKey }).isCorrect,
    ).toBe(true);
    expect(
      checkPartOneAnswer({ rawAnswer: "13.5", answerKind: "short_text", correctAnswer: editorKey }).isCorrect,
    ).toBe(true);
    expect(
      checkPartOneAnswer({ rawAnswer: "14", answerKind: "short_text", correctAnswer: editorKey }).isCorrect,
    ).toBe(false);
  });

  it("honours an acceptable variant the editor added", () => {
    expect(
      checkPartOneAnswer({
        rawAnswer: "0,5",
        answerKind: "short_text",
        correctAnswer: "1/2",
        acceptableAnswers: ["0.5"],
      }).isCorrect,
    ).toBe(true);
  });
});
