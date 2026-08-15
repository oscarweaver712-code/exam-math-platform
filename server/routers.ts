import { COOKIE_NAME } from "@shared/const";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  curriculumUnits,
  examTaskTypes,
  examTracks,
  learningPromos,
  platformProfiles,
  savedTasks,
  subjects,
  taskAttempts,
  taskCurriculumUnits,
  taskTheoryUnits,
  taskVisuals,
  tasks,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
  userTheoryProgress,
} from "../drizzle/schema";
import { checkPartOneAnswer } from "./answerValidation";
import { canChooseInitialRole, isPartOneAutoCheckEligible } from "./learningPolicy";
import { aggregateProgress } from "./progress";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { ensureOgeSeedData } from "./ogeSeed";
import { schoolRouter } from "./routers/school";

const publicFilters = z.object({
  topicSlug: z.string().optional(),
  kimNumber: z.string().optional(),
  part: z.enum(["part1", "part2"]).optional(),
  difficulty: z.enum(["basic", "standard", "advanced"]).optional(),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "База данных временно недоступна." });
  return db;
}

async function getOgeTrack() {
  await ensureOgeSeedData();
  const db = await requireDb();
  const [track] = await db
    .select({ id: examTracks.id, slug: examTracks.slug, title: examTracks.title, subjectId: subjects.id, subjectSlug: subjects.slug, subjectTitle: subjects.title })
    .from(examTracks)
    .innerJoin(subjects, eq(examTracks.subjectId, subjects.id))
    .where(and(eq(examTracks.slug, "oge-mathematics"), eq(examTracks.isActive, true)))
    .limit(1);
  if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Траектория ОГЭ по математике не найдена." });
  return track;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  publicBank: router({
    overview: publicProcedure.query(async () => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const topicRows = await db
        .select({ slug: curriculumUnits.slug, title: curriculumUnits.title, description: curriculumUnits.description })
        .from(curriculumUnits)
        .where(eq(curriculumUnits.subjectId, track.subjectId))
        .orderBy(asc(curriculumUnits.sortOrder));
      const taskRows = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.examTrackId, track.id), eq(tasks.status, "published")));
      const theoryRows = await db
        .select({ id: theoryUnits.id })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .where(and(eq(theoryExamTracks.examTrackId, track.id), eq(theoryUnits.status, "published")));
      const taskTypes = await db
        .select({ kimNumber: examTaskTypes.kimNumber, title: examTaskTypes.title, part: examTaskTypes.part })
        .from(examTaskTypes)
        .where(eq(examTaskTypes.examTrackId, track.id))
        .orderBy(asc(examTaskTypes.sortOrder));
      return { track, topics: topicRows, taskTypes, taskCount: taskRows.length, theoryCount: theoryRows.length };
    }),
    activePromo: publicProcedure.input(z.object({ placement: z.enum(["theory", "bank", "homework"]) })).query(async ({ input }) => {
      const track = await getOgeTrack();
      const now = Date.now();
      const promos = await (await requireDb())
        .select({ id: learningPromos.id, eyebrow: learningPromos.eyebrow, title: learningPromos.title, description: learningPromos.description, ctaLabel: learningPromos.ctaLabel, ctaUrl: learningPromos.ctaUrl, startsAt: learningPromos.startsAt, endsAt: learningPromos.endsAt })
        .from(learningPromos)
        .where(and(eq(learningPromos.examTrackId, track.id), eq(learningPromos.placement, input.placement), eq(learningPromos.isActive, true)))
        .orderBy(asc(learningPromos.sortOrder));
      return promos.find(promo => (!promo.startsAt || promo.startsAt <= now) && (!promo.endsAt || promo.endsAt >= now)) ?? null;
    }),
    listTasks: publicProcedure.input(publicFilters).query(async ({ input }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const filters = [eq(tasks.examTrackId, track.id), eq(tasks.status, "published")];
      if (input.topicSlug) filters.push(eq(curriculumUnits.slug, input.topicSlug));
      if (input.kimNumber) filters.push(eq(examTaskTypes.kimNumber, input.kimNumber));
      if (input.part) filters.push(eq(examTaskTypes.part, input.part));
      if (input.difficulty) filters.push(eq(tasks.difficulty, input.difficulty));
      return db
        .select({
          id: tasks.id,
          slug: tasks.slug,
          title: tasks.title,
          statementMarkdown: tasks.statementMarkdown,
          difficulty: tasks.difficulty,
          sourceKind: tasks.sourceKind,
          kimNumber: examTaskTypes.kimNumber,
          part: examTaskTypes.part,
          taskType: examTaskTypes.title,
          topicSlug: curriculumUnits.slug,
          topicTitle: curriculumUnits.title,
        })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(...filters))
        .orderBy(asc(examTaskTypes.sortOrder), asc(tasks.title));
    }),
    getTask: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(async ({ input }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const [task] = await db
        .select({
          id: tasks.id,
          slug: tasks.slug,
          title: tasks.title,
          statementMarkdown: tasks.statementMarkdown,
          answerChoices: tasks.answerChoices,
          answerKind: tasks.answerKind,
          solutionMarkdown: tasks.solutionMarkdown,
          difficulty: tasks.difficulty,
          sourceKind: tasks.sourceKind,
          sourceUrl: tasks.sourceUrl,
          kimNumber: examTaskTypes.kimNumber,
          part: examTaskTypes.part,
          taskType: examTaskTypes.title,
          topicTitle: curriculumUnits.title,
        })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(tasks.examTrackId, track.id), eq(tasks.slug, input.slug), eq(tasks.status, "published")))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задание не найдено." });
      const relatedTheory = await db
        .select({ slug: theoryUnits.slug, title: theoryUnits.title, lead: theoryUnits.lead })
        .from(taskTheoryUnits)
        .innerJoin(theoryUnits, eq(taskTheoryUnits.theoryUnitId, theoryUnits.id))
        .where(and(eq(taskTheoryUnits.taskId, task.id), eq(theoryUnits.status, "published")));
      const visuals = await db
        .select({ id: taskVisuals.id, kind: taskVisuals.kind, placement: taskVisuals.placement, diagramKey: taskVisuals.diagramKey, assetUrl: taskVisuals.assetUrl, altText: taskVisuals.altText, caption: taskVisuals.caption })
        .from(taskVisuals)
        .where(and(eq(taskVisuals.taskId, task.id), eq(taskVisuals.reviewStatus, "approved")))
        .orderBy(asc(taskVisuals.sortOrder));
      return { ...task, relatedTheory, visuals };
    }),
    checkAnswer: publicProcedure
      .input(z.object({ taskId: z.number().int().positive(), rawAnswer: z.string().min(1).max(1024) }))
      .mutation(async ({ input }) => {
        await ensureOgeSeedData();
        const db = await requireDb();
        const [task] = await db
          .select({
            answerKind: tasks.answerKind,
            correctAnswer: tasks.correctAnswer,
            acceptableAnswers: tasks.acceptableAnswers,
            part: examTaskTypes.part,
          })
          .from(tasks)
          .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
          .where(and(eq(tasks.id, input.taskId), eq(tasks.status, "published")))
          .limit(1);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задание не найдено." });
        if (!isPartOneAutoCheckEligible({ part: task.part, answerKind: task.answerKind, correctAnswer: task.correctAnswer }) || !task.correctAnswer) {
          return { checkStatus: "awaiting_review" as const, isCorrect: null, feedback: "Это задание проверяется преподавателем вручную." };
        }
        const result = checkPartOneAnswer({
          rawAnswer: input.rawAnswer,
          answerKind: task.answerKind,
          correctAnswer: task.correctAnswer,
          acceptableAnswers: task.acceptableAnswers ?? [],
        });
        return { checkStatus: result.isCorrect ? ("correct" as const) : ("incorrect" as const), ...result };
      }),
    listTheory: publicProcedure.input(z.object({ subjectSlug: z.string().optional(), examTrackSlug: z.string().optional(), topicSlug: z.string().optional(), kimNumber: z.string().optional(), search: z.string().trim().max(120).optional() })).query(async ({ input }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      if ((input.subjectSlug && input.subjectSlug !== track.subjectSlug) || (input.examTrackSlug && input.examTrackSlug !== track.slug)) return [];
      const filters = [eq(theoryExamTracks.examTrackId, track.id), eq(theoryUnits.status, "published")];
      if (input.topicSlug) filters.push(eq(curriculumUnits.slug, input.topicSlug));
      if (input.kimNumber) filters.push(eq(examTaskTypes.kimNumber, input.kimNumber));
      const theoryRows = await db
        .select({
          id: theoryUnits.id,
          slug: theoryUnits.slug,
          title: theoryUnits.title,
          lead: theoryUnits.lead,
          bodyMarkdown: theoryUnits.bodyMarkdown,
          sourceKind: theoryUnits.sourceKind,
          sourceTitle: theoryUnits.sourceTitle,
          sourceUrl: theoryUnits.sourceUrl,
          topicTitle: curriculumUnits.title,
          kimNumber: examTaskTypes.kimNumber,
          subjectTitle: subjects.title,
          examTrackTitle: examTracks.title,
        })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .innerJoin(theoryCurriculumUnits, eq(theoryUnits.id, theoryCurriculumUnits.theoryUnitId))
        .innerJoin(curriculumUnits, eq(theoryCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .innerJoin(theoryTaskTypes, eq(theoryUnits.id, theoryTaskTypes.theoryUnitId))
        .innerJoin(examTaskTypes, eq(theoryTaskTypes.examTaskTypeId, examTaskTypes.id))
        .innerJoin(subjects, eq(theoryUnits.subjectId, subjects.id))
        .innerJoin(examTracks, eq(theoryExamTracks.examTrackId, examTracks.id))
        .where(and(...filters))
        .orderBy(asc(theoryUnits.sortOrder));
      const relatedRows = await db
        .select({ theoryUnitId: taskTheoryUnits.theoryUnitId, id: tasks.id, slug: tasks.slug, title: tasks.title, kimNumber: examTaskTypes.kimNumber })
        .from(taskTheoryUnits)
        .innerJoin(tasks, eq(taskTheoryUnits.taskId, tasks.id))
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .where(and(eq(tasks.examTrackId, track.id), eq(tasks.status, "published")));
      const relatedByTheory = new Map<number, Array<{ id: number; slug: string; title: string; kimNumber: string }>>();
      for (const row of relatedRows) {
        const current = relatedByTheory.get(row.theoryUnitId) ?? [];
        current.push({ id: row.id, slug: row.slug, title: row.title, kimNumber: row.kimNumber });
        relatedByTheory.set(row.theoryUnitId, current);
      }
      const normalizedSearch = input.search?.toLocaleLowerCase("ru-RU");
      return theoryRows
        .filter(item => !normalizedSearch || `${item.title} ${item.lead} ${item.bodyMarkdown}`.toLocaleLowerCase("ru-RU").includes(normalizedSearch))
        .map(item => ({ ...item, relatedTasks: relatedByTheory.get(item.id) ?? [] }));
    }),
  }),
  theory: router({
    progress: protectedProcedure.query(async ({ ctx }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const units = await db
        .select({ id: theoryUnits.id, topicTitle: curriculumUnits.title, topicSlug: curriculumUnits.slug })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .innerJoin(theoryCurriculumUnits, eq(theoryUnits.id, theoryCurriculumUnits.theoryUnitId))
        .innerJoin(curriculumUnits, eq(theoryCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(theoryExamTracks.examTrackId, track.id), eq(theoryUnits.status, "published")));
      const completions = await db
        .select({ theoryUnitId: userTheoryProgress.theoryUnitId, completedAt: userTheoryProgress.completedAt })
        .from(userTheoryProgress)
        .where(eq(userTheoryProgress.userId, ctx.user.id));
      const completedById = new Map(completions.map(item => [item.theoryUnitId, item.completedAt]));
      const topicMap = new Map<string, { topicSlug: string; topicTitle: string; total: number; completed: number }>();
      for (const unit of units) {
        const current = topicMap.get(unit.topicSlug) ?? { topicSlug: unit.topicSlug, topicTitle: unit.topicTitle, total: 0, completed: 0 };
        current.total += 1;
        if (completedById.has(unit.id)) current.completed += 1;
        topicMap.set(unit.topicSlug, current);
      }
      return { completedTheoryUnitIds: Array.from(completedById.keys()), total: units.length, completed: units.filter(unit => completedById.has(unit.id)).length, byTopic: Array.from(topicMap.values()) };
    }),
    toggleCompletion: protectedProcedure.input(z.object({ theoryUnitId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const [unit] = await db
        .select({ id: theoryUnits.id })
        .from(theoryExamTracks)
        .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
        .where(and(eq(theoryExamTracks.examTrackId, track.id), eq(theoryUnits.id, input.theoryUnitId), eq(theoryUnits.status, "published")))
        .limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      const [existing] = await db
        .select({ theoryUnitId: userTheoryProgress.theoryUnitId })
        .from(userTheoryProgress)
        .where(and(eq(userTheoryProgress.userId, ctx.user.id), eq(userTheoryProgress.theoryUnitId, input.theoryUnitId)))
        .limit(1);
      if (existing) {
        await db.delete(userTheoryProgress).where(and(eq(userTheoryProgress.userId, ctx.user.id), eq(userTheoryProgress.theoryUnitId, input.theoryUnitId)));
        return { completed: false };
      }
      const timestamp = Date.now();
      await db.insert(userTheoryProgress).values({ userId: ctx.user.id, theoryUnitId: input.theoryUnitId, completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
      return { completed: true };
    }),
  }),
  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      await db
        .insert(platformProfiles)
        .values({ userId: ctx.user.id, learningRole: "unselected", displayName: ctx.user.name ?? null, createdAt: Date.now(), updatedAt: Date.now() })
        .onDuplicateKeyUpdate({ set: { updatedAt: Date.now() } });
      const [profile] = await db.select().from(platformProfiles).where(eq(platformProfiles.userId, ctx.user.id)).limit(1);
      return profile ?? null;
    }),
    chooseRole: protectedProcedure.input(z.object({ role: z.enum(["student", "tutor"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db.select().from(platformProfiles).where(eq(platformProfiles.userId, ctx.user.id)).limit(1);
      if (!canChooseInitialRole(existing?.learningRole)) {
        throw new TRPCError({ code: "CONFLICT", message: "Роль уже выбрана. Изменение роли выполняется администратором." });
      }
      await db
        .insert(platformProfiles)
        .values({ userId: ctx.user.id, learningRole: input.role, displayName: ctx.user.name ?? null, roleChosenAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() })
        .onDuplicateKeyUpdate({ set: { learningRole: input.role, roleChosenAt: Date.now(), updatedAt: Date.now() } });
      return { learningRole: input.role };
    }),
  }),
  learning: router({
    saved: protectedProcedure.query(async ({ ctx }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      return db
        .select({ id: tasks.id, slug: tasks.slug, title: tasks.title, kimNumber: examTaskTypes.kimNumber, savedAt: savedTasks.createdAt })
        .from(savedTasks)
        .innerJoin(tasks, eq(savedTasks.taskId, tasks.id))
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .where(and(eq(savedTasks.userId, ctx.user.id), eq(tasks.examTrackId, track.id)))
        .orderBy(desc(savedTasks.createdAt));
    }),
    saveTask: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .insert(savedTasks)
        .values({ userId: ctx.user.id, taskId: input.taskId, createdAt: Date.now() })
        .onDuplicateKeyUpdate({ set: { createdAt: Date.now() } });
      return { success: true };
    }),
    removeSavedTask: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(savedTasks).where(and(eq(savedTasks.userId, ctx.user.id), eq(savedTasks.taskId, input.taskId)));
      return { success: true };
    }),
    practiceSet: protectedProcedure.query(async ({ ctx }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const saved = await db
        .select({ id: tasks.id, slug: tasks.slug, title: tasks.title, kimNumber: examTaskTypes.kimNumber, topicTitle: curriculumUnits.title })
        .from(savedTasks)
        .innerJoin(tasks, eq(savedTasks.taskId, tasks.id))
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(savedTasks.userId, ctx.user.id), eq(tasks.examTrackId, track.id), eq(tasks.status, "published")))
        .orderBy(desc(savedTasks.createdAt))
        .limit(5);
      if (saved.length) return { source: "saved" as const, tasks: saved };
      const starter = await db
        .select({ id: tasks.id, slug: tasks.slug, title: tasks.title, kimNumber: examTaskTypes.kimNumber, topicTitle: curriculumUnits.title })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(tasks.examTrackId, track.id), eq(tasks.status, "published"), eq(tasks.difficulty, "basic")))
        .orderBy(asc(examTaskTypes.sortOrder))
        .limit(5);
      return { source: "starter" as const, tasks: starter };
    }),
    attemptHistory: protectedProcedure.query(async ({ ctx }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      return db
        .select({
          id: taskAttempts.id,
          rawAnswer: taskAttempts.rawAnswer,
          checkStatus: taskAttempts.checkStatus,
          feedback: taskAttempts.feedback,
          submittedAt: taskAttempts.submittedAt,
          taskTitle: tasks.title,
          taskSlug: tasks.slug,
          kimNumber: examTaskTypes.kimNumber,
          topicTitle: curriculumUnits.title,
        })
        .from(taskAttempts)
        .innerJoin(tasks, eq(taskAttempts.taskId, tasks.id))
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(taskAttempts.userId, ctx.user.id), eq(tasks.examTrackId, track.id)))
        .orderBy(desc(taskAttempts.submittedAt))
        .limit(20);
    }),
    submitAttempt: protectedProcedure
      .input(z.object({ taskId: z.number().int().positive(), rawAnswer: z.string().min(1).max(1024) }))
      .mutation(async ({ ctx, input }) => {
        await ensureOgeSeedData();
        const db = await requireDb();
        const [task] = await db
          .select({
            answerKind: tasks.answerKind,
            correctAnswer: tasks.correctAnswer,
            acceptableAnswers: tasks.acceptableAnswers,
            part: examTaskTypes.part,
          })
          .from(tasks)
          .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
          .where(and(eq(tasks.id, input.taskId), eq(tasks.status, "published")))
          .limit(1);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задание не найдено." });
        if (!isPartOneAutoCheckEligible({ part: task.part, answerKind: task.answerKind, correctAnswer: task.correctAnswer }) || !task.correctAnswer) {
          await db.insert(taskAttempts).values({ userId: ctx.user.id, taskId: input.taskId, rawAnswer: input.rawAnswer, checkStatus: "awaiting_review", submittedAt: Date.now() });
          return { checkStatus: "awaiting_review" as const, isCorrect: null, feedback: "Ответ сохранён и ожидает проверки преподавателя." };
        }
        const result = checkPartOneAnswer({ rawAnswer: input.rawAnswer, answerKind: task.answerKind, correctAnswer: task.correctAnswer, acceptableAnswers: task.acceptableAnswers ?? [] });
        await db.insert(taskAttempts).values({
          userId: ctx.user.id,
          taskId: input.taskId,
          rawAnswer: input.rawAnswer,
          normalizedAnswer: result.normalizedAnswer,
          checkStatus: result.isCorrect ? "correct" : "incorrect",
          isCorrect: result.isCorrect,
          feedback: result.feedback,
          submittedAt: Date.now(),
        });
        return { checkStatus: result.isCorrect ? ("correct" as const) : ("incorrect" as const), ...result };
      }),
    progress: protectedProcedure.query(async ({ ctx }) => {
      const track = await getOgeTrack();
      const db = await requireDb();
      const attempts = await db
        .select({
          taskId: taskAttempts.taskId,
          submittedAt: taskAttempts.submittedAt,
          isCorrect: taskAttempts.isCorrect,
          status: taskAttempts.checkStatus,
          topic: curriculumUnits.title,
          taskType: examTaskTypes.title,
          kimNumber: examTaskTypes.kimNumber,
        })
        .from(taskAttempts)
        .innerJoin(tasks, eq(taskAttempts.taskId, tasks.id))
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .innerJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .innerJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(eq(taskAttempts.userId, ctx.user.id), eq(tasks.examTrackId, track.id)))
        .orderBy(desc(taskAttempts.submittedAt));
      return aggregateProgress(attempts);
    }),
  }),
  admin: router({
    refreshPrototypeContent: adminProcedure.mutation(async () => {
      const subjectId = await ensureOgeSeedData();
      return { subjectId };
    }),
  }),
  school: schoolRouter,
});

export type AppRouter = typeof appRouter;
