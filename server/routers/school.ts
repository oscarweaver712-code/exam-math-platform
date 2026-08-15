import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  curriculumUnits,
  examTaskTypes,
  examTracks,
  homeworkAssignments,
  homeworkItems,
  platformProfiles,
  subjects,
  taskCurriculumUnits,
  tasks,
  tutorStudentLinks,
  tutorSubjectSpecialties,
  users,
} from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ensureOgeSeedData } from "../ogeSeed";
import { canCreateHomework } from "../learningPolicy";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "База данных временно недоступна." });
  return db;
}

async function getMathTrack() {
  await ensureOgeSeedData();
  const db = await requireDb();
  const [track] = await db
    .select({ trackId: examTracks.id, subjectId: subjects.id })
    .from(examTracks)
    .innerJoin(subjects, eq(examTracks.subjectId, subjects.id))
    .where(and(eq(examTracks.slug, "oge-mathematics"), eq(examTracks.isActive, true)))
    .limit(1);
  if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Траектория ОГЭ по математике не найдена." });
  return { db, ...track };
}

async function requireLearningRole(userId: number, role: "student" | "tutor") {
  const db = await requireDb();
  const [profile] = await db.select().from(platformProfiles).where(eq(platformProfiles.userId, userId)).limit(1);
  if (!profile || profile.learningRole !== role) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Этот раздел доступен для роли «${role === "student" ? "Ученик" : "Репетитор"}».` });
  }
  return db;
}

const adminTaskInput = z.object({
  title: z.string().min(4).max(220),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  statementMarkdown: z.string().min(10),
  solutionMarkdown: z.string().min(10),
  topicSlug: z.string(),
  kimNumber: z.string(),
  difficulty: z.enum(["basic", "standard", "advanced"]),
  answerKind: z.enum(["short_integer", "short_decimal", "short_text", "manual"]),
  correctAnswer: z.string().max(1024).optional(),
  status: z.enum(["draft", "review", "published"]).default("draft"),
});

export const schoolRouter = router({
  tutor: router({
    students: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireLearningRole(ctx.user.id, "tutor");
      return db
        .select({
          linkId: tutorStudentLinks.id,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          inviteCode: tutorStudentLinks.inviteCode,
          status: tutorStudentLinks.status,
          createdAt: tutorStudentLinks.createdAt,
        })
        .from(tutorStudentLinks)
        .innerJoin(users, eq(tutorStudentLinks.studentUserId, users.id))
        .where(eq(tutorStudentLinks.tutorUserId, ctx.user.id))
        .orderBy(desc(tutorStudentLinks.createdAt));
    }),
    createInvite: protectedProcedure
      .input(z.object({ studentEmail: z.string().email(), subjectSlug: z.string().default("mathematics") }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireLearningRole(ctx.user.id, "tutor");
        const [subject] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, input.subjectSlug)).limit(1);
        if (!subject) throw new TRPCError({ code: "NOT_FOUND", message: "Предмет не найден." });
        const [student] = await db
          .select({ id: users.id, name: users.name, learningRole: platformProfiles.learningRole })
          .from(users)
          .leftJoin(platformProfiles, eq(users.id, platformProfiles.userId))
          .where(eq(users.email, input.studentEmail.trim().toLowerCase()))
          .limit(1);
        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Ученик с таким адресом ещё не вошёл в платформу." });
        if (student.learningRole !== "student") throw new TRPCError({ code: "CONFLICT", message: "Этот пользователь ещё не выбрал роль ученика." });
        const [existing] = await db
          .select({ id: tutorStudentLinks.id, inviteCode: tutorStudentLinks.inviteCode, status: tutorStudentLinks.status })
          .from(tutorStudentLinks)
          .where(and(eq(tutorStudentLinks.tutorUserId, ctx.user.id), eq(tutorStudentLinks.studentUserId, student.id), eq(tutorStudentLinks.subjectId, subject.id)))
          .limit(1);
        if (existing) return { inviteCode: existing.inviteCode, status: existing.status, studentName: student.name };
        const inviteCode = nanoid(8).toUpperCase();
        await db.insert(tutorSubjectSpecialties).values({ tutorUserId: ctx.user.id, subjectId: subject.id, isActive: true, createdAt: Date.now() }).onDuplicateKeyUpdate({ set: { isActive: true } });
        await db.insert(tutorStudentLinks).values({ tutorUserId: ctx.user.id, studentUserId: student.id, subjectId: subject.id, inviteCode, status: "pending", createdAt: Date.now(), updatedAt: Date.now() });
        return { inviteCode, status: "pending" as const, studentName: student.name };
      }),
    createHomework: protectedProcedure
      .input(z.object({ studentUserId: z.number().int().positive(), title: z.string().min(3).max(220), note: z.string().max(2000).optional(), dueAt: z.number().int().positive().optional(), taskIds: z.array(z.number().int().positive()).min(1).max(40) }))
      .mutation(async ({ ctx, input }) => {
        const { db, subjectId, trackId } = await getMathTrack();
        await requireLearningRole(ctx.user.id, "tutor");
        const [link] = await db
          .select({ id: tutorStudentLinks.id })
          .from(tutorStudentLinks)
          .where(and(eq(tutorStudentLinks.tutorUserId, ctx.user.id), eq(tutorStudentLinks.studentUserId, input.studentUserId), eq(tutorStudentLinks.subjectId, subjectId), eq(tutorStudentLinks.status, "active")))
          .limit(1);
        if (!link) throw new TRPCError({ code: "FORBIDDEN", message: "Сначала ученик должен принять приглашение." });
        const selectedTasks = await db
          .select({ id: tasks.id, contentVersion: tasks.contentVersion })
          .from(tasks)
          .where(and(inArray(tasks.id, input.taskIds), eq(tasks.examTrackId, trackId), eq(tasks.status, "published")));
        if (!canCreateHomework({ tutorStudentLinkStatus: "active", requestedTaskCount: input.taskIds.length, accessibleTaskCount: selectedTasks.length })) throw new TRPCError({ code: "BAD_REQUEST", message: "Одно или несколько заданий недоступны." });
        const inserted = await db.insert(homeworkAssignments).values({ tutorUserId: ctx.user.id, studentUserId: input.studentUserId, subjectId, title: input.title.trim(), note: input.note?.trim() || null, dueAt: input.dueAt ?? null, status: "assigned", createdAt: Date.now(), updatedAt: Date.now() });
        const homeworkId = Number(inserted[0].insertId);
        await db.insert(homeworkItems).values(selectedTasks.map((task, index) => ({ homeworkAssignmentId: homeworkId, taskId: task.id, taskContentVersion: task.contentVersion, sortOrder: index + 1, createdAt: Date.now() })));
        return { homeworkId };
      }),
    homework: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireLearningRole(ctx.user.id, "tutor");
      return db
        .select({ id: homeworkAssignments.id, title: homeworkAssignments.title, dueAt: homeworkAssignments.dueAt, status: homeworkAssignments.status, studentName: users.name })
        .from(homeworkAssignments)
        .innerJoin(users, eq(homeworkAssignments.studentUserId, users.id))
        .where(eq(homeworkAssignments.tutorUserId, ctx.user.id))
        .orderBy(desc(homeworkAssignments.createdAt));
    }),
  }),
  student: router({
    acceptInvite: protectedProcedure.input(z.object({ code: z.string().trim().min(6).max(64) })).mutation(async ({ ctx, input }) => {
      const db = await requireLearningRole(ctx.user.id, "student");
      const [link] = await db
        .select({ id: tutorStudentLinks.id, status: tutorStudentLinks.status })
        .from(tutorStudentLinks)
        .where(and(eq(tutorStudentLinks.studentUserId, ctx.user.id), eq(tutorStudentLinks.inviteCode, input.code.toUpperCase())))
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Приглашение не найдено." });
      await db.update(tutorStudentLinks).set({ status: "active", updatedAt: Date.now() }).where(eq(tutorStudentLinks.id, link.id));
      return { success: true };
    }),
    homework: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireLearningRole(ctx.user.id, "student");
      const assignments = await db
        .select({ id: homeworkAssignments.id, title: homeworkAssignments.title, note: homeworkAssignments.note, dueAt: homeworkAssignments.dueAt, status: homeworkAssignments.status, tutorName: users.name })
        .from(homeworkAssignments)
        .innerJoin(users, eq(homeworkAssignments.tutorUserId, users.id))
        .where(and(eq(homeworkAssignments.studentUserId, ctx.user.id), eq(homeworkAssignments.status, "assigned")))
        .orderBy(asc(homeworkAssignments.dueAt));
      return Promise.all(assignments.map(async assignment => ({
        ...assignment,
        items: await db
          .select({ taskId: tasks.id, slug: tasks.slug, title: tasks.title, kimNumber: examTaskTypes.kimNumber })
          .from(homeworkItems)
          .innerJoin(tasks, eq(homeworkItems.taskId, tasks.id))
          .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
          .where(eq(homeworkItems.homeworkAssignmentId, assignment.id))
          .orderBy(asc(homeworkItems.sortOrder)),
      })));
    }),
  }),
  admin: router({
    tasks: adminProcedure.query(async () => {
      const { db, trackId } = await getMathTrack();
      return db
        .select({ id: tasks.id, title: tasks.title, slug: tasks.slug, status: tasks.status, difficulty: tasks.difficulty, kimNumber: examTaskTypes.kimNumber, topicTitle: curriculumUnits.title })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(eq(tasks.examTrackId, trackId))
        .orderBy(desc(tasks.updatedAt));
    }),
    options: adminProcedure.query(async () => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [topics, taskTypes] = await Promise.all([
        db.select({ slug: curriculumUnits.slug, title: curriculumUnits.title }).from(curriculumUnits).where(eq(curriculumUnits.subjectId, subjectId)).orderBy(asc(curriculumUnits.sortOrder)),
        db.select({ kimNumber: examTaskTypes.kimNumber, title: examTaskTypes.title }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId)).orderBy(asc(examTaskTypes.sortOrder)),
      ]);
      return { topics, taskTypes };
    }),
    getTask: adminProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          slug: tasks.slug,
          statementMarkdown: tasks.statementMarkdown,
          solutionMarkdown: tasks.solutionMarkdown,
          answerKind: tasks.answerKind,
          correctAnswer: tasks.correctAnswer,
          difficulty: tasks.difficulty,
          status: tasks.status,
          topicSlug: curriculumUnits.slug,
          kimNumber: examTaskTypes.kimNumber,
        })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId)))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
      return task;
    }),
    createTask: adminProcedure
      .input(adminTaskInput)
      .mutation(async ({ input }) => {
        const { db, trackId, subjectId } = await getMathTrack();
        const [topic, taskType] = await Promise.all([
          db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
          db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        ]);
        if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
        if (input.answerKind !== "manual" && !input.correctAnswer?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Для Части 1 нужен правильный ответ." });
        const inserted = await db.insert(tasks).values({ subjectId, examTrackId: trackId, examTaskTypeId: taskType[0].id, slug: input.slug, title: input.title.trim(), statementMarkdown: input.statementMarkdown.trim(), answerKind: input.answerKind, correctAnswer: input.correctAnswer?.trim() || null, acceptableAnswers: [], solutionMarkdown: input.solutionMarkdown.trim(), difficulty: input.difficulty, sourceKind: "author", contentVersion: 1, status: input.status, createdAt: Date.now(), updatedAt: Date.now(), publishedAt: input.status === "published" ? Date.now() : null });
        const taskId = Number(inserted[0].insertId);
        await db.insert(taskCurriculumUnits).values({ taskId, curriculumUnitId: topic[0].id });
        return { taskId };
      }),
    updateTask: adminProcedure
      .input(adminTaskInput.extend({ taskId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { db, trackId, subjectId } = await getMathTrack();
        const [existing, topic, taskType] = await Promise.all([
          db.select({ id: tasks.id, contentVersion: tasks.contentVersion }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1),
          db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
          db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        ]);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
        if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
        if (input.answerKind !== "manual" && !input.correctAnswer?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Для Части 1 нужен правильный ответ." });
        await db.update(tasks).set({
          examTaskTypeId: taskType[0].id,
          slug: input.slug,
          title: input.title.trim(),
          statementMarkdown: input.statementMarkdown.trim(),
          answerKind: input.answerKind,
          correctAnswer: input.correctAnswer?.trim() || null,
          solutionMarkdown: input.solutionMarkdown.trim(),
          difficulty: input.difficulty,
          status: input.status,
          contentVersion: existing[0].contentVersion + 1,
          publishedAt: input.status === "published" ? Date.now() : null,
          updatedAt: Date.now(),
        }).where(eq(tasks.id, input.taskId));
        await db.delete(taskCurriculumUnits).where(eq(taskCurriculumUnits.taskId, input.taskId));
        await db.insert(taskCurriculumUnits).values({ taskId: input.taskId, curriculumUnitId: topic[0].id });
        return { taskId: input.taskId };
      }),
  }),
});
