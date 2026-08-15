import { describe, expect, it } from "vitest";
import { canChooseInitialRole, canCreateHomework, isPartOneAutoCheckEligible, isPublicContent } from "./learningPolicy";

describe("platform learning policy", () => {
  it("exposes only published tasks in the public bank", () => {
    expect(isPublicContent("published")).toBe(true);
    expect(isPublicContent("draft")).toBe(false);
    expect(isPublicContent("review")).toBe(false);
  });

  it("allows role selection only at first login", () => {
    expect(canChooseInitialRole(undefined)).toBe(true);
    expect(canChooseInitialRole("unselected")).toBe(true);
    expect(canChooseInitialRole("student")).toBe(false);
    expect(canChooseInitialRole("tutor")).toBe(false);
  });

  it("limits automatic checking to Part 1 with an answer key", () => {
    expect(isPartOneAutoCheckEligible({ part: "part1", answerKind: "short_integer", correctAnswer: "12" })).toBe(true);
    expect(isPartOneAutoCheckEligible({ part: "part2", answerKind: "short_integer", correctAnswer: "12" })).toBe(false);
    expect(isPartOneAutoCheckEligible({ part: "part1", answerKind: "manual", correctAnswer: null })).toBe(false);
  });

  it("requires an active tutor–student link and accessible tasks for homework", () => {
    expect(canCreateHomework({ tutorStudentLinkStatus: "active", requestedTaskCount: 3, accessibleTaskCount: 3 })).toBe(true);
    expect(canCreateHomework({ tutorStudentLinkStatus: "pending", requestedTaskCount: 3, accessibleTaskCount: 3 })).toBe(false);
    expect(canCreateHomework({ tutorStudentLinkStatus: "active", requestedTaskCount: 3, accessibleTaskCount: 2 })).toBe(false);
  });
});
