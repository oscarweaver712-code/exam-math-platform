import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  homeworkAssignments,
  homeworkItems,
  platformProfiles,
  subjects,
  tasks,
  tutorStudentLinks,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function testUser(id: number, openId: string, email: string, name: string): AuthenticatedUser {
  return { id, openId, email, name, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

describe("public bank and tutor homework flow", () => {
  const suffix = `flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tutorId: number | null = null;
  let studentId: number | null = null;
  let temporaryTaskIds: number[] = [];

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    if (tutorId) {
      const assignments = await db.select({ id: homeworkAssignments.id }).from(homeworkAssignments).where(eq(homeworkAssignments.tutorUserId, tutorId));
      if (assignments.length) {
        await db.delete(homeworkItems).where(eq(homeworkItems.homeworkAssignmentId, assignments[0].id));
        await db.delete(homeworkAssignments).where(eq(homeworkAssignments.tutorUserId, tutorId));
      }
    }
    if (tutorId && studentId) await db.delete(tutorStudentLinks).where(and(eq(tutorStudentLinks.tutorUserId, tutorId), eq(tutorStudentLinks.studentUserId, studentId)));
    if (tutorId) await db.delete(platformProfiles).where(eq(platformProfiles.userId, tutorId));
    if (studentId) await db.delete(platformProfiles).where(eq(platformProfiles.userId, studentId));
    if (tutorId) await db.delete(users).where(eq(users.id, tutorId));
    if (studentId) await db.delete(users).where(eq(users.id, studentId));
    if (temporaryTaskIds.length) await db.delete(tasks).where(inArray(tasks.id, temporaryTaskIds));
    temporaryTaskIds = [];
  });

  it("returns the published prototype tasks to a visitor without authentication", async () => {
    const caller = appRouter.createCaller(createContext(null));
    const listing = await caller.publicBank.listTasks({});
    expect(listing.length).toBeGreaterThan(0);
    const details = await caller.publicBank.getTask({ slug: listing[0].slug });
    expect(details.title).toBe(listing[0].title);
    expect(details.part).toBe("part1");
    const geometryTask = await caller.publicBank.getTask({ slug: "triangle-angle" });
    expect(geometryTask.visuals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "inline_svg", diagramKey: "triangle-angle-48-67" }),
    ]));
  });

  it("creates homework only for an active tutor–student link and stores its items", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for flow test");
    const now = Date.now();
    const tutorOpenId = `${suffix}-tutor`;
    const studentOpenId = `${suffix}-student`;
    await db.insert(users).values([
      { openId: tutorOpenId, email: `${suffix}-tutor@example.test`, name: "Тестовый репетитор", loginMethod: "test", role: "user", lastSignedIn: new Date() },
      { openId: studentOpenId, email: `${suffix}-student@example.test`, name: "Тестовый ученик", loginMethod: "test", role: "user", lastSignedIn: new Date() },
    ]);
    const createdUsers = await db.select({ id: users.id, openId: users.openId, email: users.email, name: users.name }).from(users).where(and(eq(users.openId, tutorOpenId)));
    const createdStudents = await db.select({ id: users.id, openId: users.openId, email: users.email, name: users.name }).from(users).where(and(eq(users.openId, studentOpenId)));
    tutorId = createdUsers[0]?.id ?? null;
    studentId = createdStudents[0]?.id ?? null;
    if (!tutorId || !studentId) throw new Error("Test users were not created");
    await db.insert(platformProfiles).values([
      { userId: tutorId, learningRole: "tutor", displayName: "Тестовый репетитор", roleChosenAt: now, createdAt: now, updatedAt: now },
      { userId: studentId, learningRole: "student", displayName: "Тестовый ученик", roleChosenAt: now, createdAt: now, updatedAt: now },
    ]);
    const [math] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, "mathematics")).limit(1);
    const [task] = await db.select({ id: tasks.id }).from(tasks).limit(1);
    if (!math || !task) throw new Error("Prototype subject or task unavailable");
    await db.insert(tutorStudentLinks).values({ tutorUserId: tutorId, studentUserId: studentId, subjectId: math.id, inviteCode: `FLOW${now}`.slice(0, 16), status: "active", createdAt: now, updatedAt: now });
    const caller = appRouter.createCaller(createContext(testUser(tutorId, tutorOpenId, `${suffix}-tutor@example.test`, "Тестовый репетитор")));
    const result = await caller.school.tutor.createHomework({ studentUserId: studentId, title: "Проверочная подборка", dueAt: now + 86_400_000, taskIds: [task.id] });
    expect(result.homeworkId).toBeGreaterThan(0);
    const items = await db.select({ id: homeworkItems.id }).from(homeworkItems).where(eq(homeworkItems.homeworkAssignmentId, result.homeworkId));
    expect(items).toHaveLength(1);
  });

  it("enforces actual protected, tutor-only, student-only and admin-only procedures", async () => {
    const anonymous = appRouter.createCaller(createContext(null));
    await expect(anonymous.school.student.homework()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const db = await getDb();
    if (!db) throw new Error("Database unavailable for role test");
    const now = Date.now();
    const openId = `${suffix}-role-student`;
    await db.insert(users).values({ openId, email: `${suffix}-role@student.example.test`, name: "Тестовый ученик", loginMethod: "test", role: "user", lastSignedIn: new Date() });
    const [created] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    studentId = created?.id ?? null;
    if (!studentId) throw new Error("Role test user was not created");
    await db.insert(platformProfiles).values({ userId: studentId, learningRole: "student", displayName: "Тестовый ученик", roleChosenAt: now, createdAt: now, updatedAt: now });
    const studentCaller = appRouter.createCaller(createContext(testUser(studentId, openId, `${suffix}-role@student.example.test`, "Тестовый ученик")));
    await expect(studentCaller.school.tutor.students()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.tasks()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.profile.chooseRole({ role: "tutor" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("excludes draft and review tasks from public list and detail procedures", async () => {
    const publicCaller = appRouter.createCaller(createContext(null));
    const publicTasks = await publicCaller.publicBank.listTasks({});
    const [base] = await (await getDb())!
      .select({
        subjectId: tasks.subjectId,
        examTrackId: tasks.examTrackId,
        examTaskTypeId: tasks.examTaskTypeId,
        statementMarkdown: tasks.statementMarkdown,
        answerKind: tasks.answerKind,
        correctAnswer: tasks.correctAnswer,
        acceptableAnswers: tasks.acceptableAnswers,
        answerChoices: tasks.answerChoices,
        solutionMarkdown: tasks.solutionMarkdown,
        difficulty: tasks.difficulty,
        sourceKind: tasks.sourceKind,
      })
      .from(tasks)
      .where(eq(tasks.id, publicTasks[0].id))
      .limit(1);
    if (!base) throw new Error("Base prototype task unavailable");
    const now = Date.now();
    for (const status of ["draft", "review"] as const) {
      const slug = `${status}-${suffix}`;
      const inserted = await (await getDb())!.insert(tasks).values({ ...base, slug, title: `${status} internal task`, contentVersion: 1, status, createdAt: now, updatedAt: now, publishedAt: null });
      temporaryTaskIds.push(Number(inserted[0].insertId));
      const listing = await publicCaller.publicBank.listTasks({});
      expect(listing.some(task => task.slug === slug)).toBe(false);
      await expect(publicCaller.publicBank.getTask({ slug })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});
