// Moved to shared/ so the answer-entry admin screen can preview a key with the
// exact normalisation the grader uses. Re-exported here to keep server imports
// (`./answerValidation`) and their tests unchanged.
export * from "@shared/answerValidation";
export type { AnswerKind, AnswerCheckResult } from "@shared/answerValidation";
