import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  contentImportCases,
  contentImportEvents,
  homeworkAssignments,
  homeworkItems,
  learningPromos,
  platformProfiles,
  subjects,
  taskEditorialEvents,
  taskTheoryUnits,
  taskVisuals,
  tasks,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
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

function testUser(id: number, openId: string, email: string, name: string, role: AuthenticatedUser["role"] = "user"): AuthenticatedUser {
  return { id, openId, email, name, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

describe("public bank and tutor homework flow", () => {
  const suffix = `flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tutorId: number | null = null;
  let studentId: number | null = null;
  let adminId: number | null = null;
  let temporaryTaskIds: number[] = [];
  let temporaryTheoryIds: number[] = [];
  let temporaryPromoIds: number[] = [];
  let temporaryImportCaseIds: number[] = [];

  beforeEach(async () => {
    const db = await getDb();
    if (!db) return;
    const [base] = await db.select({ subjectId: tasks.subjectId, examTrackId: tasks.examTrackId, examTaskTypeId: tasks.examTaskTypeId, answerKind: tasks.answerKind, correctAnswer: tasks.correctAnswer, acceptableAnswers: tasks.acceptableAnswers, answerChoices: tasks.answerChoices, statementMarkdown: tasks.statementMarkdown, solutionMarkdown: tasks.solutionMarkdown }).from(tasks).where(eq(tasks.status, "archived")).limit(1);
    if (!base) throw new Error("Archived task fixture unavailable");
    const timestamp = Date.now();
    const inserted = await db.insert(tasks).values([0, 1].map(index => ({ ...base, slug: `verified-oge-${suffix}-${timestamp}-${index}`, internalId: `TASK-TEST-${timestamp}-${index}`, title: `Проверенная тестовая задача ОГЭ ${index + 1}`, sourceKind: "fipi" as const, sourceTitle: "Открытый банк заданий ОГЭ ФИПИ", sourceUrl: "https://oge.fipi.ru/bank/index.php", sourceRecordId: `test-${timestamp}-${index}`, sourceExamYear: 2026, contentVersion: 1, status: "published" as const, createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp })));
    const firstInsertedId = Number(inserted[0].insertId);
    temporaryTaskIds.push(firstInsertedId, firstInsertedId + 1);
  });

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
    if (temporaryTheoryIds.length) {
      await db.delete(taskTheoryUnits).where(inArray(taskTheoryUnits.theoryUnitId, temporaryTheoryIds));
      await db.delete(theoryCurriculumUnits).where(inArray(theoryCurriculumUnits.theoryUnitId, temporaryTheoryIds));
      await db.delete(theoryExamTracks).where(inArray(theoryExamTracks.theoryUnitId, temporaryTheoryIds));
      await db.delete(theoryTaskTypes).where(inArray(theoryTaskTypes.theoryUnitId, temporaryTheoryIds));
      await db.delete(theoryUnits).where(inArray(theoryUnits.id, temporaryTheoryIds));
    }
    if (temporaryPromoIds.length) await db.delete(learningPromos).where(inArray(learningPromos.id, temporaryPromoIds));
    if (temporaryImportCaseIds.length) await db.delete(contentImportEvents).where(inArray(contentImportEvents.importCaseId, temporaryImportCaseIds));
    if (temporaryTaskIds.length) await db.delete(taskEditorialEvents).where(inArray(taskEditorialEvents.taskId, temporaryTaskIds));
    if (temporaryTaskIds.length) await db.delete(taskVisuals).where(inArray(taskVisuals.taskId, temporaryTaskIds));
    if (temporaryImportCaseIds.length) await db.delete(contentImportCases).where(inArray(contentImportCases.id, temporaryImportCaseIds));
    if (tutorId) await db.delete(users).where(eq(users.id, tutorId));
    if (studentId) await db.delete(users).where(eq(users.id, studentId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
    if (temporaryTaskIds.length) await db.delete(tasks).where(inArray(tasks.id, temporaryTaskIds));
    temporaryTaskIds = [];
    temporaryTheoryIds = [];
    temporaryPromoIds = [];
    temporaryImportCaseIds = [];
  });

  it("returns only a verified published OGE fixture to a visitor without authentication", async () => {
    const caller = appRouter.createCaller(createContext(null));
    const overview = await caller.publicBank.overview();
    expect(overview.taskTypes.map(item => item.kimNumber)).toEqual(Array.from({ length: 25 }, (_, index) => String(index + 1)));
    expect(overview.taskTypes.filter(item => item.part === "part1")).toHaveLength(19);
    expect(overview.taskTypes.filter(item => item.part === "part2")).toHaveLength(6);
    const listing = await caller.publicBank.listTasks({ page: 1, pageSize: 12 });
    expect(listing.items).toHaveLength(2);
    expect(listing.total).toBe(2);
    expect(listing.items[0]?.sourceExamYear).toBe(2026);
    const details = await caller.publicBank.getTask({ slug: listing.items[0].slug });
    expect(details.title).toBe(listing.items[0].title);
    expect(details.part).toBe("part1");
    expect(details.sourceExamYear).toBe(2026);
    const theory = await caller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics" });
    expect(theory).toHaveLength(19);
    expect(theory).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "fractions-and-order" }),
      expect.objectContaining({ slug: "unit-conversion" }),
    ]));
    expect(theory).toHaveLength(19);
    const probabilityTheory = await caller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics", topicSlug: "probability" });
    expect(probabilityTheory).toHaveLength(2);
    expect(probabilityTheory.every(item => item.topicTitle === "Вероятность")).toBe(true);
    const searchResults = await caller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics", search: "вероятность" });
    expect(searchResults).toEqual(expect.arrayContaining([expect.objectContaining({ slug: "classical-probability" })]));
  });

  it("keeps theory completion markers private to the authenticated learner", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for theory progress test");
    const now = Date.now();
    const firstOpenId = `${suffix}-theory-first`;
    const secondOpenId = `${suffix}-theory-second`;
    await db.insert(users).values([
      { openId: firstOpenId, email: `${suffix}-theory-first@example.test`, name: "Первый ученик", loginMethod: "test", role: "user", lastSignedIn: new Date() },
      { openId: secondOpenId, email: `${suffix}-theory-second@example.test`, name: "Второй ученик", loginMethod: "test", role: "user", lastSignedIn: new Date() },
    ]);
    const [first] = await db.select({ id: users.id }).from(users).where(eq(users.openId, firstOpenId)).limit(1);
    const [second] = await db.select({ id: users.id }).from(users).where(eq(users.openId, secondOpenId)).limit(1);
    tutorId = first?.id ?? null;
    studentId = second?.id ?? null;
    if (!tutorId || !studentId) throw new Error("Theory test users were not created");
    await db.insert(platformProfiles).values([
      { userId: tutorId, learningRole: "student", displayName: "Первый ученик", roleChosenAt: now, createdAt: now, updatedAt: now },
      { userId: studentId, learningRole: "student", displayName: "Второй ученик", roleChosenAt: now, createdAt: now, updatedAt: now },
    ]);
    const firstCaller = appRouter.createCaller(createContext(testUser(tutorId, firstOpenId, `${suffix}-theory-first@example.test`, "Первый ученик")));
    const secondCaller = appRouter.createCaller(createContext(testUser(studentId, secondOpenId, `${suffix}-theory-second@example.test`, "Второй ученик")));
    const units = await firstCaller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics" });
    const theoryUnit = units[0];
    if (!theoryUnit) throw new Error("Theory unit unavailable");
    const calculationsTheoryCount = units.filter(unit => unit.topicTitle === "Вычисления и проценты").length;
    await expect(appRouter.createCaller(createContext(null)).theory.progress()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await firstCaller.theory.toggleCompletion({ theoryUnitId: theoryUnit.id })).toEqual({ completed: true });
    const firstProgress = await firstCaller.theory.progress();
    expect(firstProgress.completedTheoryUnitIds).toContain(theoryUnit.id);
    expect(firstProgress).toMatchObject({ total: units.length, completed: 1 });
    expect(firstProgress.byTopic).toEqual(expect.arrayContaining([
      expect.objectContaining({ topicSlug: "calculations-percentages", total: calculationsTheoryCount, completed: 1 }),
    ]));
    expect((await secondCaller.theory.progress()).completedTheoryUnitIds).not.toContain(theoryUnit.id);
    expect(await firstCaller.theory.toggleCompletion({ theoryUnitId: theoryUnit.id })).toEqual({ completed: false });
    const resetProgress = await firstCaller.theory.progress();
    expect(resetProgress).toMatchObject({ total: units.length, completed: 0 });
    expect(resetProgress.byTopic).toEqual(expect.arrayContaining([
      expect.objectContaining({ topicSlug: "calculations-percentages", total: calculationsTheoryCount, completed: 0 }),
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
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.status, "published")).limit(1);
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
    await expect(anonymous.school.admin.theoryVersions({ theoryUnitId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

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
    await expect(studentCaller.school.admin.theory()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.getTheory({ theoryUnitId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.theoryVersions({ theoryUnitId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.addTheoryDiagram({ theoryUnitId: 1, placement: "body", diagramKey: "right-triangle-6-8", altText: "Несанкционированная схема" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.removeTheoryMedia({ theoryUnitId: 1, visualId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.restoreTheoryVersion({ theoryUnitId: 1, version: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.uploadTheoryMedia({ theoryUnitId: 1, placement: "body", altText: "Несанкционированное изображение", fileName: "blocked.png", contentType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const blockedTheoryInput = {
      title: "Несанкционированный конспект",
      slug: `blocked-theory-${suffix}`,
      lead: "Эта запись используется только для проверки разграничения административного доступа.",
      bodyMarkdown: "## Правило\n\nСначала проверяется административная роль пользователя.\n\n## Алгоритм\n\n1. Войти.\n2. Проверить роль.\n3. Отклонить действие без прав.",
      topicSlug: "equations",
      kimNumber: "8",
      relatedTaskIds: [],
      sourceKind: "author" as const,
      status: "draft" as const,
    };
    await expect(studentCaller.school.admin.createTheory(blockedTheoryInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.updateTheory({ ...blockedTheoryInput, theoryUnitId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.school.admin.createPromo({ placement: "theory", eyebrow: "Эфир школы", title: "Разбор задач", description: "Собственный открытый разбор для проверки разграничения доступа.", ctaLabel: "Открыть", ctaUrl: "https://school911.example/events", isActive: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
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
        sourceKind: tasks.sourceKind,
      })
      .from(tasks)
      .where(eq(tasks.id, publicTasks.items[0].id))
      .limit(1);
    if (!base) throw new Error("Base prototype task unavailable");
    const now = Date.now();
    for (const status of ["draft", "review"] as const) {
      const slug = `${status}-${suffix}`;
      const inserted = await (await getDb())!.insert(tasks).values({ ...base, slug, internalId: `TASK-TEST-${status}-${suffix}`.slice(0, 64), title: `${status} internal task`, contentVersion: 1, status, createdAt: now, updatedAt: now, publishedAt: null });
      temporaryTaskIds.push(Number(inserted[0].insertId));
      const listing = await publicCaller.publicBank.listTasks({});
      expect(listing.items.some(task => task.slug === slug)).toBe(false);
      await expect(publicCaller.publicBank.getTask({ slug })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("requires legal clearance before converting an import and separately moderates external task media", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for intake test");
    const openId = `${suffix}-intake-admin`;
    await db.insert(users).values({ openId, email: `${suffix}-intake-admin@example.test`, name: "Правовой редактор", loginMethod: "test", role: "admin", lastSignedIn: new Date() });
    const [created] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    adminId = created?.id ?? null;
    if (!adminId) throw new Error("Intake admin was not created");
    const adminCaller = appRouter.createCaller(createContext(testUser(adminId, openId, `${suffix}-intake-admin@example.test`, "Правовой редактор", "admin")));
    const blockedCaller = appRouter.createCaller(createContext(testUser(adminId + 80_000, `${suffix}-intake-student`, `${suffix}-intake-student@example.test`, "Ученик", "user")));
    const options = await adminCaller.school.admin.options();
    const kimNumber = options.taskTypes[0]?.kimNumber;
    const topicSlug = options.topics[0]?.slug;
    if (!kimNumber || !topicSlug) throw new Error("Task editor options unavailable");
    const intakeInput = { kimNumber, sourceKind: "fipi" as const, sourceTitle: "Открытый банк заданий ОГЭ ФИПИ", sourceUrl: "https://oge.fipi.ru/bank/index.php", sourceRecordId: `legal-fixture-${suffix}`, sourceExamYear: 2026, proposedTitle: "Авторская адаптация задачи", sourceSummary: "Редактор зарегистрировал карточку внешнего материала для проверки происхождения и допустимого сценария использования.", plannedAdaptation: "Редакция создаст самостоятельную тренировочную задачу с новыми числами, новой формулировкой и авторским решением." };
    await expect(blockedCaller.school.admin.submitImportCase(intakeInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const createdCase = await adminCaller.school.admin.submitImportCase(intakeInput);
    temporaryImportCaseIds.push(createdCase.importCaseId);
    const convertInput = { importCaseId: createdCase.importCaseId, slug: `legal-adaptation-${suffix}`, title: "Авторская адаптация задачи", statementMarkdown: "Решите редакторскую тренировочную задачу и запишите ответ.", solutionMarkdown: "Проведите вычисления последовательно и проверьте полученный результат.", topicSlug, answerKind: "short_integer" as const, correctAnswer: "7" };
    await expect(adminCaller.school.admin.convertImportCase(convertInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await adminCaller.school.admin.clearImportCase({ importCaseId: createdCase.importCaseId, note: "Условия использования проверены; разрешена редакторская адаптация без копирования исходной формулировки.", rightsBasis: "Проверено редактором по зарегистрированному источнику.", rightsEvidenceUrl: "https://fipi.ru/oge/demoversii-specifikacii-kodifikatory" });
    const converted = await adminCaller.school.admin.convertImportCase(convertInput);
    temporaryTaskIds.push(converted.taskId);
    await expect(adminCaller.school.admin.importCases({ page: 1, pageSize: 12 })).resolves.toEqual(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ id: createdCase.importCaseId, status: "converted", convertedTaskId: converted.taskId })]) }));
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4xGQAAAAASUVORK5CYII=";
    const uploaded = await adminCaller.school.admin.uploadTaskMedia({ taskId: converted.taskId, placement: "statement", altText: "Тестовое внешнее изображение для проверки модерации.", sourceKind: "external", sourceUrl: "https://example.test/image-source", fileName: "review.png", contentType: "image/png", dataUrl });
    await expect(adminCaller.school.admin.externalMediaQueue({ page: 1, pageSize: 12 })).resolves.toEqual(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ id: uploaded.visualId, taskId: converted.taskId })]) }));
    await expect(blockedCaller.school.admin.moderateExternalMedia({ visualId: uploaded.visualId, decision: "approved", note: "Проверка прав и соответствия редакционной политике завершена положительно." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await adminCaller.school.admin.moderateExternalMedia({ visualId: uploaded.visualId, decision: "approved", note: "Проверка прав и соответствия редакционной политике завершена положительно." });
    await expect(adminCaller.school.admin.getTask({ taskId: converted.taskId })).resolves.toEqual(expect.objectContaining({ visuals: expect.arrayContaining([expect.objectContaining({ id: uploaded.visualId, reviewStatus: "approved" })]) }));
    await expect(adminCaller.school.admin.importCaseEvents({ importCaseId: createdCase.importCaseId })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "submitted" }), expect.objectContaining({ eventType: "rights_cleared" }), expect.objectContaining({ eventType: "converted" })]));
  });

  it("keeps source metadata and the archive lifecycle under administrator control", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for task lifecycle test");
    const openId = `${suffix}-task-admin`;
    await db.insert(users).values({ openId, email: `${suffix}-task-admin@example.test`, name: "Редактор банка", loginMethod: "test", role: "admin", lastSignedIn: new Date() });
    const [created] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    adminId = created?.id ?? null;
    if (!adminId) throw new Error("Task editor user was not created");
    const adminCaller = appRouter.createCaller(createContext(testUser(adminId, openId, `${suffix}-task-admin@example.test`, "Редактор банка", "admin")));
    const studentCaller = appRouter.createCaller(createContext(testUser(adminId + 90_000, `${suffix}-student-blocked`, `${suffix}-student-blocked@example.test`, "Ученик", "user")));
    const [options, publicTasks] = await Promise.all([adminCaller.school.admin.options(), appRouter.createCaller(createContext(null)).publicBank.listTasks({})]);
    const topicSlug = options.topics[0]?.slug;
    const kimNumber = options.taskTypes[0]?.kimNumber;
    if (!topicSlug || !kimNumber) throw new Error("Task editor options unavailable");
    const slug = `source-lifecycle-${suffix}`;
    const taskInput = { title: "Редакционная задача с источником", slug, statementMarkdown: "Вычислите значение выражения и запишите ответ.", solutionMarkdown: "Подставьте данные и выполните вычисления по порядку.", topicSlug, kimNumber, answerKind: "short_integer" as const, correctAnswer: "1", sourceKind: "fipi" as const, sourceTitle: "Открытый банк заданий ОГЭ ФИПИ", sourceUrl: "https://oge.fipi.ru/bank/index.php", sourceRecordId: "fixture-source-001", sourceExamYear: 2026, hints: [], solutionSteps: [], status: "published" as const };
    await expect(studentCaller.school.admin.archiveTask({ taskId: publicTasks.items[0].id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const createdTask = await adminCaller.school.admin.createTask(taskInput);
    temporaryTaskIds.push(createdTask.taskId);
    await expect(adminCaller.school.admin.updateTaskSource({ taskId: createdTask.taskId, sourceKind: "fipi", sourceTitle: "", sourceUrl: "https://oge.fipi.ru/bank/index.php", sourceExamYear: 2026 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const publicCaller = appRouter.createCaller(createContext(null));
    expect((await publicCaller.publicBank.listTasks({})).items).toEqual(expect.arrayContaining([expect.objectContaining({ slug, status: "published", sourceKind: "fipi", sourceTitle: taskInput.sourceTitle, sourceUrl: taskInput.sourceUrl, sourceRecordId: taskInput.sourceRecordId, sourceExamYear: 2026 })]));
    await expect(adminCaller.school.admin.tasks({ page: 1, pageSize: 6 })).resolves.toEqual(expect.objectContaining({ page: 1, pageSize: 6, items: expect.any(Array) }));
    await adminCaller.school.admin.archiveTask({ taskId: createdTask.taskId, note: "Снято на редакционную проверку" });
    expect((await publicCaller.publicBank.listTasks({})).items.some(task => task.slug === slug)).toBe(false);
    await adminCaller.school.admin.restoreTask({ taskId: createdTask.taskId, status: "published", note: "Проверка завершена" });
    expect((await publicCaller.publicBank.listTasks({})).items.some(task => task.slug === slug)).toBe(true);
    await adminCaller.school.admin.softDeleteTask({ taskId: createdTask.taskId, note: "Тестовое мягкое удаление" });
    expect((await publicCaller.publicBank.listTasks({})).items.some(task => task.slug === slug)).toBe(false);
    await expect(adminCaller.school.admin.taskEvents({ taskId: createdTask.taskId })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "archived" }), expect.objectContaining({ eventType: "restored" }), expect.objectContaining({ eventType: "soft_deleted" })]));
  });

  it("keeps theory drafts private and allows only an administrator to publish an editor-reviewed theory unit", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for theory editor test");
    const openId = `${suffix}-theory-admin`;
    await db.insert(users).values({ openId, email: `${suffix}-theory-admin@example.test`, name: "Тестовый редактор", loginMethod: "test", role: "admin", lastSignedIn: new Date() });
    const [created] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    adminId = created?.id ?? null;
    if (!adminId) throw new Error("Theory editor user was not created");
    const anonymous = appRouter.createCaller(createContext(null));
    await expect(anonymous.school.admin.theory()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const publicCaller = appRouter.createCaller(createContext(null));
    const adminCaller = appRouter.createCaller(createContext(testUser(adminId, openId, `${suffix}-theory-admin@example.test`, "Тестовый редактор", "admin")));
    const [options, publicTasks] = await Promise.all([adminCaller.school.admin.options(), publicCaller.publicBank.listTasks({})]);
    const topicSlug = options.topics[0]?.slug;
    const kimNumber = options.taskTypes[0]?.kimNumber;
    const relatedTaskId = publicTasks.items[0]?.id;
    if (!topicSlug || !kimNumber || !relatedTaskId) throw new Error("Theory editor options unavailable");
    const slug = `editor-theory-${suffix}`;
    const input = {
      title: "Редакторский конспект по пропорциям",
      slug,
      lead: "Авторский материал для проверки жизненного цикла редакционного конспекта.",
      bodyMarkdown: "## Правило\n\nСначала фиксируем отношение величин и только затем составляем пропорцию.\n\n## Алгоритм\n\n1. Выпишите данные.\n2. Составьте равенство отношений.\n3. Проверьте ответ.",
      topicSlug,
      kimNumber,
      relatedTaskIds: [relatedTaskId],
      sourceKind: "author" as const,
      status: "draft" as const,
    };
    const createdTheory = await adminCaller.school.admin.createTheory(input);
    temporaryTheoryIds.push(createdTheory.theoryUnitId);
    const firstVersions = await adminCaller.school.admin.theoryVersions({ theoryUnitId: createdTheory.theoryUnitId });
    expect(firstVersions).toEqual(expect.arrayContaining([expect.objectContaining({ version: 1, snapshot: expect.objectContaining({ title: input.title }) })]));
    expect((await publicCaller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics" })).some(item => item.slug === slug)).toBe(false);
    await adminCaller.school.admin.updateTheory({ ...input, theoryUnitId: createdTheory.theoryUnitId, status: "published" });
    await adminCaller.school.admin.addTheoryDiagram({ theoryUnitId: createdTheory.theoryUnitId, placement: "body", diagramKey: "right-triangle-6-8", altText: "Тестовая схема прямоугольного треугольника", caption: "Тестовая подпись" });
    const published = await publicCaller.publicBank.listTheory({ subjectSlug: "mathematics", examTrackSlug: "oge-mathematics" });
    expect(published).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug, sourceKind: "author", relatedTasks: expect.arrayContaining([expect.objectContaining({ id: relatedTaskId })]), visuals: expect.arrayContaining([expect.objectContaining({ diagramKey: "right-triangle-6-8" })]) }),
    ]));
    await adminCaller.school.admin.restoreTheoryVersion({ theoryUnitId: createdTheory.theoryUnitId, version: 1, changeNote: "Проверка отката" });
    const restored = await adminCaller.school.admin.getTheory({ theoryUnitId: createdTheory.theoryUnitId });
    expect(restored.visuals).toHaveLength(0);
    expect((await adminCaller.school.admin.theoryVersions({ theoryUnitId: createdTheory.theoryUnitId })).length).toBeGreaterThanOrEqual(4);
  });

  it("shows an editor-controlled school event only after an administrator activates it", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable for promo test");
    const openId = `${suffix}-promo-admin`;
    await db.insert(users).values({ openId, email: `${suffix}-promo-admin@example.test`, name: "Редактор событий", loginMethod: "test", role: "admin", lastSignedIn: new Date() });
    const [created] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    adminId = created?.id ?? null;
    if (!adminId) throw new Error("Promo editor user was not created");
    const adminCaller = appRouter.createCaller(createContext(testUser(adminId, openId, `${suffix}-promo-admin@example.test`, "Редактор событий", "admin")));
    const input = { placement: "theory" as const, eyebrow: "Эфир Школы 911", title: "Открытый разбор планиметрии", description: "Собственный учебный эфир с разбором базовых задач по планиметрии.", ctaLabel: "Записаться", ctaUrl: "https://school911.example/events/geometry", isActive: false };
    const createdPromo = await adminCaller.school.admin.createPromo(input);
    temporaryPromoIds.push(createdPromo.promoId);
    const publicCaller = appRouter.createCaller(createContext(null));
    expect(await publicCaller.publicBank.activePromo({ placement: "theory" })).toBeNull();
    await adminCaller.school.admin.updatePromo({ ...input, promoId: createdPromo.promoId, isActive: true });
    await expect(publicCaller.publicBank.activePromo({ placement: "theory" })).resolves.toMatchObject({ id: createdPromo.promoId, title: input.title, ctaUrl: input.ctaUrl });
  });
});
