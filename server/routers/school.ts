import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  curriculumUnits,
  examTaskTypes,
  examTracks,
  homeworkAssignments,
  homeworkItems,
  learningPromos,
  platformProfiles,
  subjects,
  taskCurriculumUnits,
  taskTheoryUnits,
  tasks,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
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

const adminTheoryInput = z.object({
  title: z.string().min(4).max(220),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  lead: z.string().min(10).max(1000),
  bodyMarkdown: z.string().min(80).max(20_000),
  topicSlug: z.string(),
  kimNumber: z.string(),
  relatedTaskIds: z.array(z.number().int().positive()).max(24).default([]),
  sourceKind: z.enum(["author", "licensed", "external_reference"]).default("author"),
  sourceTitle: z.string().trim().max(255).optional(),
  sourceUrl: z.string().url().max(1024).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).default("draft"),
});

const adminPromoInput = z.object({
  placement: z.enum(["theory", "bank", "homework"]),
  eyebrow: z.string().trim().min(3).max(140),
  title: z.string().trim().min(4).max(220),
  description: z.string().trim().min(10).max(2000),
  ctaLabel: z.string().trim().min(2).max(120),
  ctaUrl: z.string().url().max(1024),
  isActive: z.boolean(),
  startsAt: z.number().int().positive().optional(),
  endsAt: z.number().int().positive().optional(),
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
    promos: adminProcedure.query(async () => {
      const { db, trackId } = await getMathTrack();
      return db.select().from(learningPromos).where(eq(learningPromos.examTrackId, trackId)).orderBy(desc(learningPromos.updatedAt));
    }),
    createPromo: adminProcedure.input(adminPromoInput).mutation(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Дата окончания должна быть позже даты начала." });
      const [lastPromo] = await db.select({ sortOrder: learningPromos.sortOrder }).from(learningPromos).where(eq(learningPromos.examTrackId, trackId)).orderBy(desc(learningPromos.sortOrder)).limit(1);
      const timestamp = Date.now();
      const inserted = await db.insert(learningPromos).values({ examTrackId: trackId, placement: input.placement, eyebrow: input.eyebrow, title: input.title, description: input.description, ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl, isActive: input.isActive, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, sortOrder: (lastPromo?.sortOrder ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp });
      return { promoId: Number(inserted[0].insertId) };
    }),
    updatePromo: adminProcedure.input(adminPromoInput.extend({ promoId: z.number().int().positive() })).mutation(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Дата окончания должна быть позже даты начала." });
      const [existing] = await db.select({ id: learningPromos.id }).from(learningPromos).where(and(eq(learningPromos.id, input.promoId), eq(learningPromos.examTrackId, trackId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Промоблок не найден." });
      await db.update(learningPromos).set({ placement: input.placement, eyebrow: input.eyebrow, title: input.title, description: input.description, ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl, isActive: input.isActive, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, updatedAt: Date.now() }).where(eq(learningPromos.id, input.promoId));
      return { promoId: input.promoId };
    }),
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
    theory: adminProcedure.query(async () => {
      const { db, trackId } = await getMathTrack();
      return db
        .select({
          id: theoryUnits.id,
          title: theoryUnits.title,
          slug: theoryUnits.slug,
          status: theoryUnits.status,
          updatedAt: theoryUnits.updatedAt,
          sourceKind: theoryUnits.sourceKind,
          sourceTitle: theoryUnits.sourceTitle,
          topicSlug: curriculumUnits.slug,
          topicTitle: curriculumUnits.title,
          kimNumber: examTaskTypes.kimNumber,
        })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .innerJoin(theoryCurriculumUnits, eq(theoryUnits.id, theoryCurriculumUnits.theoryUnitId))
        .innerJoin(curriculumUnits, eq(theoryCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .innerJoin(theoryTaskTypes, eq(theoryUnits.id, theoryTaskTypes.theoryUnitId))
        .innerJoin(examTaskTypes, eq(theoryTaskTypes.examTaskTypeId, examTaskTypes.id))
        .where(eq(theoryExamTracks.examTrackId, trackId))
        .orderBy(desc(theoryUnits.updatedAt));
    }),
    getTheory: adminProcedure.input(z.object({ theoryUnitId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [unit] = await db
        .select({
          id: theoryUnits.id,
          title: theoryUnits.title,
          slug: theoryUnits.slug,
          lead: theoryUnits.lead,
          bodyMarkdown: theoryUnits.bodyMarkdown,
          status: theoryUnits.status,
          sourceKind: theoryUnits.sourceKind,
          sourceTitle: theoryUnits.sourceTitle,
          sourceUrl: theoryUnits.sourceUrl,
          topicSlug: curriculumUnits.slug,
          kimNumber: examTaskTypes.kimNumber,
        })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .innerJoin(theoryCurriculumUnits, eq(theoryUnits.id, theoryCurriculumUnits.theoryUnitId))
        .innerJoin(curriculumUnits, eq(theoryCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .innerJoin(theoryTaskTypes, eq(theoryUnits.id, theoryTaskTypes.theoryUnitId))
        .innerJoin(examTaskTypes, eq(theoryTaskTypes.examTaskTypeId, examTaskTypes.id))
        .where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId)))
        .limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      const relatedTasks = await db
        .select({ id: tasks.id, title: tasks.title, slug: tasks.slug })
        .from(taskTheoryUnits)
        .innerJoin(tasks, eq(taskTheoryUnits.taskId, tasks.id))
        .where(and(eq(taskTheoryUnits.theoryUnitId, unit.id), eq(tasks.examTrackId, trackId)));
      return { ...unit, relatedTaskIds: relatedTasks.map(task => task.id), relatedTasks };
    }),
    createTheory: adminProcedure.input(adminTheoryInput).mutation(async ({ input }) => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [topic, taskType, linkedTasks, lastTheory] = await Promise.all([
        db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
        db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        input.relatedTaskIds.length
          ? db.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, input.relatedTaskIds), eq(tasks.examTrackId, trackId)))
          : Promise.resolve([]),
        db.select({ sortOrder: theoryUnits.sortOrder }).from(theoryUnits).where(eq(theoryUnits.subjectId, subjectId)).orderBy(desc(theoryUnits.sortOrder)).limit(1),
      ]);
      if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
      if (linkedTasks.length !== input.relatedTaskIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Одна или несколько связанных задач недоступны." });
      if (input.sourceKind !== "author" && (!input.sourceTitle || !input.sourceUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Для внешнего или лицензированного материала укажите источник и ссылку." });
      const timestamp = Date.now();
      const inserted = await db.insert(theoryUnits).values({ subjectId, slug: input.slug, title: input.title.trim(), lead: input.lead.trim(), bodyMarkdown: input.bodyMarkdown.trim(), sourceKind: input.sourceKind, sourceTitle: input.sourceKind === "author" ? "Авторский материал Школы 911" : input.sourceTitle?.trim() || null, sourceUrl: input.sourceKind === "author" ? null : input.sourceUrl?.trim() || null, contentVersion: 1, status: input.status, sortOrder: (lastTheory[0]?.sortOrder ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp, publishedAt: input.status === "published" ? timestamp : null });
      const theoryUnitId = Number(inserted[0].insertId);
      await db.insert(theoryExamTracks).values({ theoryUnitId, examTrackId: trackId });
      await db.insert(theoryCurriculumUnits).values({ theoryUnitId, curriculumUnitId: topic[0].id });
      await db.insert(theoryTaskTypes).values({ theoryUnitId, examTaskTypeId: taskType[0].id });
      if (input.relatedTaskIds.length) await db.insert(taskTheoryUnits).values(input.relatedTaskIds.map(taskId => ({ taskId, theoryUnitId })));
      return { theoryUnitId };
    }),
    updateTheory: adminProcedure.input(adminTheoryInput.extend({ theoryUnitId: z.number().int().positive() })).mutation(async ({ input }) => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [existing, topic, taskType, linkedTasks] = await Promise.all([
        db.select({ id: theoryUnits.id }).from(theoryExamTracks).innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id)).where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId))).limit(1),
        db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
        db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        input.relatedTaskIds.length
          ? db.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, input.relatedTaskIds), eq(tasks.examTrackId, trackId)))
          : Promise.resolve([]),
      ]);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
      if (linkedTasks.length !== input.relatedTaskIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Одна или несколько связанных задач недоступны." });
      if (input.sourceKind !== "author" && (!input.sourceTitle || !input.sourceUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Для внешнего или лицензированного материала укажите источник и ссылку." });
      const timestamp = Date.now();
      await db.update(theoryUnits).set({ slug: input.slug, title: input.title.trim(), lead: input.lead.trim(), bodyMarkdown: input.bodyMarkdown.trim(), sourceKind: input.sourceKind, sourceTitle: input.sourceKind === "author" ? "Авторский материал Школы 911" : input.sourceTitle?.trim() || null, sourceUrl: input.sourceKind === "author" ? null : input.sourceUrl?.trim() || null, contentVersion: sql`${theoryUnits.contentVersion} + 1`, status: input.status, publishedAt: input.status === "published" ? timestamp : null, updatedAt: timestamp }).where(eq(theoryUnits.id, input.theoryUnitId));
      await db.delete(theoryCurriculumUnits).where(eq(theoryCurriculumUnits.theoryUnitId, input.theoryUnitId));
      await db.delete(theoryTaskTypes).where(eq(theoryTaskTypes.theoryUnitId, input.theoryUnitId));
      await db.delete(taskTheoryUnits).where(eq(taskTheoryUnits.theoryUnitId, input.theoryUnitId));
      await db.insert(theoryCurriculumUnits).values({ theoryUnitId: input.theoryUnitId, curriculumUnitId: topic[0].id });
      await db.insert(theoryTaskTypes).values({ theoryUnitId: input.theoryUnitId, examTaskTypeId: taskType[0].id });
      if (input.relatedTaskIds.length) await db.insert(taskTheoryUnits).values(input.relatedTaskIds.map(taskId => ({ taskId, theoryUnitId: input.theoryUnitId })));
      return { theoryUnitId: input.theoryUnitId };
    }),
  }),
});
