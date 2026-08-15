import type { AnswerKind } from "./answerValidation";

export function isPublicContent(status: "draft" | "review" | "published" | "archived") {
  return status === "published";
}

export function canChooseInitialRole(currentRole: "unselected" | "student" | "tutor" | undefined) {
  return !currentRole || currentRole === "unselected";
}

export function isPartOneAutoCheckEligible({
  part,
  answerKind,
  correctAnswer,
}: {
  part: "part1" | "part2";
  answerKind: AnswerKind;
  correctAnswer: string | null;
}) {
  return part === "part1" && answerKind !== "manual" && Boolean(correctAnswer);
}

export function canCreateHomework({
  tutorStudentLinkStatus,
  requestedTaskCount,
  accessibleTaskCount,
}: {
  tutorStudentLinkStatus: "pending" | "active" | "blocked" | undefined;
  requestedTaskCount: number;
  accessibleTaskCount: number;
}) {
  return tutorStudentLinkStatus === "active" && requestedTaskCount > 0 && requestedTaskCount === accessibleTaskCount;
}
