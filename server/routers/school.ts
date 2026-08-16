import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  contentImportCases,
  contentImportEvents,
  curriculumUnits,
  editorialAccessRoles,
  examTaskTypes,
  examTracks,
  homeworkAssignments,
  homeworkItems,
  learningPromos,
  platformProfiles,
  subjects,
  taskCurriculumUnits,
  taskEditorialEvents,
  taskHints,
  taskSolutionSteps,
  taskTheoryUnits,
  taskVisuals,
  tasks,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
  theoryUnitVersions,
  theoryVisuals,
  type TheoryVersionSnapshot,
  tutorStudentLinks,
  tutorSubjectSpecialties,
  users,
} from "../../drizzle/schema";
import { adminProcedure, ownerProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ensureOgeSeedData } from "../ogeSeed";
import { canCreateHomework } from "../learningPolicy";
import { storagePut } from "../storage";

const IMMUTABLE_TASK_ID_PREFIX = "SH911-OGE";
const createImmutableTaskId = () => `${IMMUTABLE_TASK_ID_PREFIX}-${nanoid(12).toUpperCase()}`;

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
  answerKind: z.enum(["short_integer", "short_decimal", "short_text", "manual"]),
  correctAnswer: z.string().max(1024).optional(),
  sourceKind: z.enum(["author", "fipi", "partner"]),
  sourceTitle: z.string().trim().min(3).max(255),
  sourceUrl: z.string().trim().url().max(1024).optional().or(z.literal("")),
  sourceRecordId: z.string().trim().max(255).optional(),
  sourceExamYear: z.number().int().min(2023).max(2026),
  hints: z.array(z.object({ title: z.string().trim().min(2).max(160), bodyMarkdown: z.string().trim().min(5).max(4000) })).max(6).default([]),
  solutionSteps: z.array(z.object({ title: z.string().trim().min(2).max(180), bodyMarkdown: z.string().trim().min(5).max(6000) })).max(12).default([]),
  status: z.enum(["draft", "review", "published"]).default("draft"),
}).superRefine((input, ctx) => {
  if (input.sourceKind !== "author" && !input.sourceUrl?.trim()) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Для внешнего источника обязателен проверяемый URL." });
  }
});

const taskLifecycleInput = z.object({ taskId: z.number().int().positive(), note: z.string().trim().min(3).max(500).optional() });
const editorialTaskQueueInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(6).max(24).default(12),
  status: z.enum(["draft", "review", "published", "archived"]).optional(),
  sourceExamYear: z.number().int().min(2023).max(2026).optional(),
  internalId: z.string().trim().min(3).max(64).optional(),
});

async function recordTaskEvent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  taskId: number,
  editorUserId: number,
  eventType: "created" | "updated" | "published" | "archived" | "restored" | "soft_deleted" | "source_updated" | "media_added" | "media_approved" | "media_rejected" | "media_removed",
  note?: string,
) {
  const [task] = await db.select({ internalId: tasks.internalId, title: tasks.title, slug: tasks.slug, status: tasks.status, sourceKind: tasks.sourceKind, sourceTitle: tasks.sourceTitle, sourceUrl: tasks.sourceUrl, sourceRecordId: tasks.sourceRecordId, contentVersion: tasks.contentVersion, archivedAt: tasks.archivedAt, deletedAt: tasks.deletedAt }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;
  await db.insert(taskEditorialEvents).values({ taskId, editorUserId, eventType, note: note || null, snapshot: task, createdAt: Date.now() });
}

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
  changeNote: z.string().trim().max(500).optional(),
  status: z.enum(["draft", "review", "published", "archived"]).default("draft"),
});

const theoryDiagramKey = z.enum(["right-triangle-6-8", "similar-triangles-scale", "triangle-base-height"]);
const theoryMediaUploadInput = z.object({
  theoryUnitId: z.number().int().positive(),
  placement: z.enum(["lead", "body"]).default("body"),
  altText: z.string().trim().min(5).max(1000),
  caption: z.string().trim().max(500).optional(),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  dataUrl: z.string().min(32).max(7_000_000),
});

const taskDiagramKey = z.enum(["triangle-angle-48-67", "isosceles-40", "function-line-3x-minus-2", "rate-time-distance-180-3"]);
const taskMediaUploadInput = z.object({
  taskId: z.number().int().positive(),
  placement: z.enum(["statement", "solution"]).default("statement"),
  altText: z.string().trim().min(5).max(1000),
  caption: z.string().trim().max(500).optional(),
  sourceKind: z.enum(["author", "external"]).default("author"),
  sourceUrl: z.string().url().max(2048).optional(),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  dataUrl: z.string().min(32).max(7_000_000),
});

const importCaseInput = z.object({
  kimNumber: z.string().trim().min(1).max(32),
  sourceKind: z.enum(["fipi", "partner"]),
  sourceTitle: z.string().trim().min(3).max(255),
  sourceUrl: z.string().url().max(1024),
  sourceRecordId: z.string().trim().max(255).optional(),
  sourceExamYear: z.number().int().min(2023).max(2026),
  proposedTitle: z.string().trim().min(4).max(220),
  sourceSummary: z.string().trim().min(20).max(8_000),
  plannedAdaptation: z.string().trim().min(20).max(8_000),
});

const importDecisionInput = z.object({
  importCaseId: z.number().int().positive(),
  note: z.string().trim().min(10).max(4_000),
  rightsBasis: z.string().trim().min(10).max(500).optional(),
  rightsEvidenceUrl: z.string().url().max(1024).optional(),
});

async function recordImportEvent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  importCaseId: number,
  actorUserId: number,
  eventType: "submitted" | "assigned" | "rights_cleared" | "rejected" | "converted",
  note?: string,
) {
  const [item] = await db.select().from(contentImportCases).where(eq(contentImportCases.id, importCaseId)).limit(1);
  if (!item) return;
  await db.insert(contentImportEvents).values({ importCaseId, actorUserId, eventType, note: note || null, snapshot: item, createdAt: Date.now() });
}

async function getTheorySnapshot(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, theoryUnitId: number): Promise<{ contentVersion: number; snapshot: TheoryVersionSnapshot }> {
  const [unit] = await db.select({ title: theoryUnits.title, slug: theoryUnits.slug, lead: theoryUnits.lead, bodyMarkdown: theoryUnits.bodyMarkdown, sourceKind: theoryUnits.sourceKind, sourceTitle: theoryUnits.sourceTitle, sourceUrl: theoryUnits.sourceUrl, contentVersion: theoryUnits.contentVersion }).from(theoryUnits).where(eq(theoryUnits.id, theoryUnitId)).limit(1);
  if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
  const [topic, taskType, relatedTasks, visuals] = await Promise.all([
    db.select({ slug: curriculumUnits.slug }).from(theoryCurriculumUnits).innerJoin(curriculumUnits, eq(theoryCurriculumUnits.curriculumUnitId, curriculumUnits.id)).where(eq(theoryCurriculumUnits.theoryUnitId, theoryUnitId)).limit(1),
    db.select({ kimNumber: examTaskTypes.kimNumber }).from(theoryTaskTypes).innerJoin(examTaskTypes, eq(theoryTaskTypes.examTaskTypeId, examTaskTypes.id)).where(eq(theoryTaskTypes.theoryUnitId, theoryUnitId)).limit(1),
    db.select({ taskId: taskTheoryUnits.taskId }).from(taskTheoryUnits).where(eq(taskTheoryUnits.theoryUnitId, theoryUnitId)),
    db.select({ kind: theoryVisuals.kind, placement: theoryVisuals.placement, diagramKey: theoryVisuals.diagramKey, assetUrl: theoryVisuals.assetUrl, altText: theoryVisuals.altText, caption: theoryVisuals.caption }).from(theoryVisuals).where(eq(theoryVisuals.theoryUnitId, theoryUnitId)).orderBy(asc(theoryVisuals.sortOrder)),
  ]);
  if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Связи конспекта неполны." });
  return { contentVersion: unit.contentVersion, snapshot: { title: unit.title, slug: unit.slug, lead: unit.lead, bodyMarkdown: unit.bodyMarkdown, topicSlug: topic[0].slug, kimNumber: taskType[0].kimNumber, relatedTaskIds: relatedTasks.map(item => item.taskId), sourceKind: unit.sourceKind, sourceTitle: unit.sourceTitle, sourceUrl: unit.sourceUrl, visuals } };
}

async function storeTheoryVersion(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, theoryUnitId: number, userId: number, changeNote?: string) {
  const { contentVersion, snapshot } = await getTheorySnapshot(db, theoryUnitId);
  const [latest] = await db.select({ version: theoryUnitVersions.version }).from(theoryUnitVersions).where(eq(theoryUnitVersions.theoryUnitId, theoryUnitId)).orderBy(desc(theoryUnitVersions.version)).limit(1);
  const version = Math.max(contentVersion, (latest?.version ?? 0) + 1);
  await db.insert(theoryUnitVersions).values({ theoryUnitId, version, snapshot, changeNote: changeNote || null, createdByUserId: userId, createdAt: Date.now() });
}

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
  owner: router({
    editorialAccounts: ownerProcedure.query(async () => {
      const db = await requireDb();
      return db.select({ id: users.id, name: users.name, email: users.email, openId: users.openId, legacyRole: users.role, editorialRole: editorialAccessRoles.role, isActive: editorialAccessRoles.isActive, grantedAt: editorialAccessRoles.createdAt, revokedAt: editorialAccessRoles.revokedAt }).from(users).leftJoin(editorialAccessRoles, eq(editorialAccessRoles.userId, users.id)).orderBy(desc(users.lastSignedIn));
    }),
    grantEditorialAccess: ownerProcedure.input(z.object({ email: z.string().email().max(320), role: z.enum(["admin", "editor"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Сначала пользователь должен войти в платформу с этим аккаунтом." });
      const timestamp = Date.now();
      const [existing] = await db.select({ id: editorialAccessRoles.id }).from(editorialAccessRoles).where(eq(editorialAccessRoles.userId, target.id)).limit(1);
      if (existing) await db.update(editorialAccessRoles).set({ role: input.role, isActive: true, grantedByUserId: ctx.user.id, revokedByUserId: null, revokedAt: null, updatedAt: timestamp }).where(eq(editorialAccessRoles.id, existing.id));
      else await db.insert(editorialAccessRoles).values({ userId: target.id, role: input.role, isActive: true, grantedByUserId: ctx.user.id, createdAt: timestamp, updatedAt: timestamp });
      await db.update(users).set({ role: "admin" }).where(eq(users.id, target.id));
      return { userId: target.id, role: input.role };
    }),
    revokeEditorialAccess: ownerProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Владелец не может отозвать собственный доступ через интерфейс." });
      const db = await requireDb(); const timestamp = Date.now();
      const [access] = await db.select({ id: editorialAccessRoles.id }).from(editorialAccessRoles).where(eq(editorialAccessRoles.userId, input.userId)).limit(1);
      if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "Для этого аккаунта не найден управляемый редакционный доступ." });
      await db.update(editorialAccessRoles).set({ isActive: false, revokedByUserId: ctx.user.id, revokedAt: timestamp, updatedAt: timestamp }).where(eq(editorialAccessRoles.id, access.id));
      await db.update(users).set({ role: "user" }).where(eq(users.id, input.userId));
      return { userId: input.userId, revoked: true };
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
    tasks: adminProcedure.input(editorialTaskQueueInput.optional()).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 12;
      const filters = [eq(tasks.examTrackId, trackId)];
      if (input?.status) filters.push(eq(tasks.status, input.status));
      if (input?.sourceExamYear) filters.push(eq(tasks.sourceExamYear, input.sourceExamYear));
      if (input?.internalId) filters.push(sql`${tasks.internalId} LIKE ${`%${input.internalId}%`}`);
      const [totalRow] = await db.select({ total: sql<number>`count(${tasks.id})` }).from(tasks).where(and(...filters));
      const items = await db
        .select({ id: tasks.id, internalId: tasks.internalId, title: tasks.title, slug: tasks.slug, status: tasks.status, sourceKind: tasks.sourceKind, sourceTitle: tasks.sourceTitle, sourceUrl: tasks.sourceUrl, sourceRecordId: tasks.sourceRecordId, sourceExamYear: tasks.sourceExamYear, archivedAt: tasks.archivedAt, deletedAt: tasks.deletedAt, kimNumber: examTaskTypes.kimNumber, topicTitle: curriculumUnits.title })
        .from(tasks)
        .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id))
        .leftJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
        .leftJoin(curriculumUnits, eq(taskCurriculumUnits.curriculumUnitId, curriculumUnits.id))
        .where(and(...filters))
        .orderBy(desc(tasks.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const total = Number(totalRow?.total ?? 0);
      return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    }),
    options: adminProcedure.query(async () => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [topics, taskTypes] = await Promise.all([
        db.select({ slug: curriculumUnits.slug, title: curriculumUnits.title }).from(curriculumUnits).where(eq(curriculumUnits.subjectId, subjectId)).orderBy(asc(curriculumUnits.sortOrder)),
        db.select({ kimNumber: examTaskTypes.kimNumber, title: examTaskTypes.title, requiresVisual: examTaskTypes.requiresVisual }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId)).orderBy(asc(examTaskTypes.sortOrder)),
      ]);
      return { topics, taskTypes };
    }),
    importCases: adminProcedure.input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(6).max(24).default(12) })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [totalRow] = await db.select({ total: sql<number>`count(${contentImportCases.id})` }).from(contentImportCases).where(eq(contentImportCases.examTrackId, trackId));
      const items = await db
        .select({
          id: contentImportCases.id,
          status: contentImportCases.status,
          sourceKind: contentImportCases.sourceKind,
          sourceTitle: contentImportCases.sourceTitle,
          sourceUrl: contentImportCases.sourceUrl,
          sourceRecordId: contentImportCases.sourceRecordId,
          sourceExamYear: contentImportCases.sourceExamYear,
          proposedTitle: contentImportCases.proposedTitle,
          sourceSummary: contentImportCases.sourceSummary,
          plannedAdaptation: contentImportCases.plannedAdaptation,
          rightsBasis: contentImportCases.rightsBasis,
          rightsEvidenceUrl: contentImportCases.rightsEvidenceUrl,
          legalReviewNote: contentImportCases.legalReviewNote,
          reviewedAt: contentImportCases.reviewedAt,
          createdAt: contentImportCases.createdAt,
          kimNumber: examTaskTypes.kimNumber,
          taskTypeTitle: examTaskTypes.title,
          submittedBy: users.name,
          assignedEditorUserId: contentImportCases.assignedEditorUserId,
          assignedAt: contentImportCases.assignedAt,
          convertedTaskId: contentImportCases.convertedTaskId,
        })
        .from(contentImportCases)
        .innerJoin(examTaskTypes, eq(contentImportCases.examTaskTypeId, examTaskTypes.id))
        .leftJoin(users, eq(contentImportCases.submittedByUserId, users.id))
        .where(eq(contentImportCases.examTrackId, trackId))
        .orderBy(desc(contentImportCases.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      const total = Number(totalRow?.total ?? 0);
      return { items, total, page: input.page, pageSize: input.pageSize, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) };
    }),
    editorialAssignees: adminProcedure.query(async () => {
      const db = await requireDb();
      return db
        .select({ userId: users.id, name: users.name, email: users.email, role: editorialAccessRoles.role })
        .from(editorialAccessRoles)
        .innerJoin(users, eq(editorialAccessRoles.userId, users.id))
        .where(and(eq(editorialAccessRoles.isActive, true), inArray(editorialAccessRoles.role, ["owner", "admin", "editor"])))
        .orderBy(asc(users.name));
    }),
    assignImportEditor: adminProcedure.input(z.object({ importCaseId: z.number().int().positive(), editorUserId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [itemRows, editorRows] = await Promise.all([
        db.select({ id: contentImportCases.id, status: contentImportCases.status }).from(contentImportCases).where(and(eq(contentImportCases.id, input.importCaseId), eq(contentImportCases.examTrackId, trackId))).limit(1),
        db.select({ id: editorialAccessRoles.id }).from(editorialAccessRoles).where(and(eq(editorialAccessRoles.userId, input.editorUserId), eq(editorialAccessRoles.isActive, true), inArray(editorialAccessRoles.role, ["owner", "admin", "editor"]))).limit(1),
      ]);
      const item = itemRows[0];
      const editor = editorRows[0];
      if (!item || item.status === "converted") throw new TRPCError({ code: "NOT_FOUND", message: "Материал не найден или уже сконвертирован." });
      if (!editor) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите активного редактора." });
      const timestamp = Date.now();
      await db.update(contentImportCases).set({ assignedEditorUserId: input.editorUserId, assignedByUserId: ctx.user.id, assignedAt: timestamp, updatedAt: timestamp }).where(eq(contentImportCases.id, input.importCaseId));
      await recordImportEvent(db, input.importCaseId, ctx.user.id, "assigned", "Материал назначен редактору для проверки.");
      return { importCaseId: input.importCaseId, editorUserId: input.editorUserId };
    }),
    importCaseEvents: adminProcedure.input(z.object({ importCaseId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [item] = await db.select({ id: contentImportCases.id }).from(contentImportCases).where(and(eq(contentImportCases.id, input.importCaseId), eq(contentImportCases.examTrackId, trackId))).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Карточка импорта не найдена." });
      return db.select({ id: contentImportEvents.id, eventType: contentImportEvents.eventType, note: contentImportEvents.note, snapshot: contentImportEvents.snapshot, createdAt: contentImportEvents.createdAt, actorName: users.name }).from(contentImportEvents).leftJoin(users, eq(contentImportEvents.actorUserId, users.id)).where(eq(contentImportEvents.importCaseId, input.importCaseId)).orderBy(desc(contentImportEvents.createdAt));
    }),
    submitImportCase: adminProcedure.input(importCaseInput).mutation(async ({ ctx, input }) => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [taskType] = await db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1);
      if (!taskType) throw new TRPCError({ code: "BAD_REQUEST", message: "Номер КИМ не найден в активной структуре экзамена." });
      const timestamp = Date.now();
      const inserted = await db.insert(contentImportCases).values({ subjectId, examTrackId: trackId, examTaskTypeId: taskType.id, sourceKind: input.sourceKind, sourceTitle: input.sourceTitle, sourceUrl: input.sourceUrl, sourceRecordId: input.sourceRecordId || null, sourceAccessedAt: timestamp, sourceExamYear: input.sourceExamYear, proposedTitle: input.proposedTitle, sourceSummary: input.sourceSummary, plannedAdaptation: input.plannedAdaptation, status: "rights_review", submittedByUserId: ctx.user.id, createdAt: timestamp, updatedAt: timestamp });
      const importCaseId = Number(inserted[0].insertId);
      await recordImportEvent(db, importCaseId, ctx.user.id, "submitted", "Карточка отправлена на обязательную правовую проверку.");
      return { importCaseId };
    }),
    clearImportCase: adminProcedure.input(importDecisionInput).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [item] = await db.select({ id: contentImportCases.id, status: contentImportCases.status }).from(contentImportCases).where(and(eq(contentImportCases.id, input.importCaseId), eq(contentImportCases.examTrackId, trackId))).limit(1);
      if (!item || item.status !== "rights_review") throw new TRPCError({ code: "BAD_REQUEST", message: "На проверку можно отправить только новую карточку импорта." });
      const timestamp = Date.now();
      await db.update(contentImportCases).set({ status: "cleared", rightsBasis: input.rightsBasis || null, rightsEvidenceUrl: input.rightsEvidenceUrl || null, legalReviewNote: input.note, reviewedByUserId: ctx.user.id, reviewedAt: timestamp, updatedAt: timestamp }).where(eq(contentImportCases.id, input.importCaseId));
      await recordImportEvent(db, input.importCaseId, ctx.user.id, "rights_cleared", input.note);
      return { importCaseId: input.importCaseId };
    }),
    rejectImportCase: adminProcedure.input(importDecisionInput).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [item] = await db.select({ id: contentImportCases.id, status: contentImportCases.status }).from(contentImportCases).where(and(eq(contentImportCases.id, input.importCaseId), eq(contentImportCases.examTrackId, trackId))).limit(1);
      if (!item || item.status !== "rights_review") throw new TRPCError({ code: "BAD_REQUEST", message: "Отклонить можно только новую карточку импорта." });
      const timestamp = Date.now();
      await db.update(contentImportCases).set({ status: "rejected", legalReviewNote: input.note, reviewedByUserId: ctx.user.id, reviewedAt: timestamp, updatedAt: timestamp }).where(eq(contentImportCases.id, input.importCaseId));
      await recordImportEvent(db, input.importCaseId, ctx.user.id, "rejected", input.note);
      return { importCaseId: input.importCaseId };
    }),
    convertImportCase: adminProcedure.input(z.object({ importCaseId: z.number().int().positive(), slug: z.string().regex(/^[a-z0-9-]+$/), title: z.string().trim().min(4).max(220), statementMarkdown: z.string().trim().min(10), solutionMarkdown: z.string().trim().min(10), topicSlug: z.string().trim().min(1), answerKind: z.enum(["short_integer", "short_decimal", "short_text", "manual"]), correctAnswer: z.string().trim().max(1024).optional() })).mutation(async ({ ctx, input }) => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [item, topic] = await Promise.all([
        db.select().from(contentImportCases).where(and(eq(contentImportCases.id, input.importCaseId), eq(contentImportCases.examTrackId, trackId))).limit(1),
        db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
      ]);
      const source = item[0];
      if (!source || source.status !== "cleared" || source.convertedTaskId || !topic[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Импорт должен быть одобрен и ещё не сконвертирован; тема должна существовать." });
      if (input.answerKind !== "manual" && !input.correctAnswer) throw new TRPCError({ code: "BAD_REQUEST", message: "Для автоматически проверяемой задачи укажите ответ." });
      const timestamp = Date.now();
      const internalId = createImmutableTaskId();
      const inserted = await db.insert(tasks).values({ subjectId, examTrackId: trackId, examTaskTypeId: source.examTaskTypeId, slug: input.slug, internalId, title: input.title, statementMarkdown: input.statementMarkdown, answerKind: input.answerKind, correctAnswer: input.correctAnswer || null, acceptableAnswers: [], solutionMarkdown: input.solutionMarkdown, sourceKind: source.sourceKind, sourceTitle: source.sourceTitle, sourceUrl: source.sourceUrl, sourceRecordId: source.sourceRecordId, sourceAccessedAt: source.sourceAccessedAt, sourceExamYear: source.sourceExamYear, contentVersion: 1, status: "draft", createdAt: timestamp, updatedAt: timestamp });
      const taskId = Number(inserted[0].insertId);
      await db.insert(taskCurriculumUnits).values({ taskId, curriculumUnitId: topic[0].id });
      await db.update(contentImportCases).set({ status: "converted", convertedTaskId: taskId, updatedAt: timestamp }).where(eq(contentImportCases.id, source.id));
      await recordTaskEvent(db, taskId, ctx.user.id, "created", `Черновик создан из правового импорта #${source.id}.`);
      await recordImportEvent(db, source.id, ctx.user.id, "converted", `Создан редакторский черновик задачи #${taskId}.`);
      return { taskId, internalId };
    }),
    externalMediaQueue: adminProcedure.input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(6).max(24).default(12) })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const filters = and(eq(tasks.examTrackId, trackId), eq(taskVisuals.sourceKind, "external"), eq(taskVisuals.reviewStatus, "review"));
      const [totalRow] = await db.select({ total: sql<number>`count(${taskVisuals.id})` }).from(taskVisuals).innerJoin(tasks, eq(taskVisuals.taskId, tasks.id)).where(filters);
      const items = await db.select({ id: taskVisuals.id, taskId: taskVisuals.taskId, assetUrl: taskVisuals.assetUrl, altText: taskVisuals.altText, caption: taskVisuals.caption, sourceUrl: taskVisuals.sourceUrl, placement: taskVisuals.placement, reviewStatus: taskVisuals.reviewStatus, reviewNote: taskVisuals.reviewNote, createdAt: taskVisuals.createdAt, taskTitle: tasks.title, taskSlug: tasks.slug, kimNumber: examTaskTypes.kimNumber }).from(taskVisuals).innerJoin(tasks, eq(taskVisuals.taskId, tasks.id)).innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id)).where(filters).orderBy(desc(taskVisuals.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
      const total = Number(totalRow?.total ?? 0);
      return { items, total, page: input.page, pageSize: input.pageSize, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) };
    }),
    moderateExternalMedia: adminProcedure.input(z.object({ visualId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().min(10).max(2_000) })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [visual] = await db.select({ id: taskVisuals.id, taskId: taskVisuals.taskId, reviewStatus: taskVisuals.reviewStatus }).from(taskVisuals).innerJoin(tasks, eq(taskVisuals.taskId, tasks.id)).where(and(eq(taskVisuals.id, input.visualId), eq(tasks.examTrackId, trackId), eq(taskVisuals.sourceKind, "external"))).limit(1);
      if (!visual || visual.reviewStatus !== "review") throw new TRPCError({ code: "BAD_REQUEST", message: "Изображение не ожидает решения модератора." });
      const timestamp = Date.now();
      await db.update(taskVisuals).set({ reviewStatus: input.decision, reviewNote: input.note, reviewedByUserId: ctx.user.id, reviewedAt: timestamp, updatedAt: timestamp }).where(eq(taskVisuals.id, visual.id));
      await recordTaskEvent(db, visual.taskId, ctx.user.id, input.decision === "approved" ? "media_approved" : "media_rejected", input.note);
      return { visualId: visual.id, reviewStatus: input.decision };
    }),
    getTask: adminProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          slug: tasks.slug,
          internalId: tasks.internalId,
          statementMarkdown: tasks.statementMarkdown,
          solutionMarkdown: tasks.solutionMarkdown,
          answerKind: tasks.answerKind,
          correctAnswer: tasks.correctAnswer,
          status: tasks.status,
          sourceKind: tasks.sourceKind,
          sourceTitle: tasks.sourceTitle,
          sourceUrl: tasks.sourceUrl,
          sourceRecordId: tasks.sourceRecordId,
          sourceAccessedAt: tasks.sourceAccessedAt,
          sourceExamYear: tasks.sourceExamYear,
          archivedAt: tasks.archivedAt,
          archivedReason: tasks.archivedReason,
          deletedAt: tasks.deletedAt,
          deletedReason: tasks.deletedReason,
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
      const [hints, solutionSteps, visuals] = await Promise.all([
        db.select({ title: taskHints.title, bodyMarkdown: taskHints.bodyMarkdown }).from(taskHints).where(eq(taskHints.taskId, task.id)).orderBy(asc(taskHints.sortOrder)),
        db.select({ title: taskSolutionSteps.title, bodyMarkdown: taskSolutionSteps.bodyMarkdown }).from(taskSolutionSteps).where(eq(taskSolutionSteps.taskId, task.id)).orderBy(asc(taskSolutionSteps.sortOrder)),
        db.select({ id: taskVisuals.id, kind: taskVisuals.kind, placement: taskVisuals.placement, diagramKey: taskVisuals.diagramKey, assetUrl: taskVisuals.assetUrl, altText: taskVisuals.altText, caption: taskVisuals.caption, sourceKind: taskVisuals.sourceKind, sourceUrl: taskVisuals.sourceUrl, reviewStatus: taskVisuals.reviewStatus }).from(taskVisuals).where(eq(taskVisuals.taskId, task.id)).orderBy(asc(taskVisuals.sortOrder)),
      ]);
      return { ...task, hints, solutionSteps, visuals };
    }),
    createTask: adminProcedure
      .input(adminTaskInput)
      .mutation(async ({ ctx, input }) => {
        const { db, trackId, subjectId } = await getMathTrack();
        const [topic, taskType] = await Promise.all([
          db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
          db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        ]);
        if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
        if (input.answerKind !== "manual" && !input.correctAnswer?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Для Части 1 нужен правильный ответ." });
        const timestamp = Date.now();
        const internalId = createImmutableTaskId();
        const inserted = await db.insert(tasks).values({ subjectId, examTrackId: trackId, examTaskTypeId: taskType[0].id, slug: input.slug, internalId, title: input.title.trim(), statementMarkdown: input.statementMarkdown.trim(), answerKind: input.answerKind, correctAnswer: input.correctAnswer?.trim() || null, acceptableAnswers: [], solutionMarkdown: input.solutionMarkdown.trim(), sourceKind: input.sourceKind, sourceTitle: input.sourceTitle.trim(), sourceUrl: input.sourceUrl?.trim() || null, sourceRecordId: input.sourceRecordId?.trim() || null, sourceAccessedAt: timestamp, sourceExamYear: input.sourceExamYear, contentVersion: 1, status: input.status, createdAt: timestamp, updatedAt: timestamp, publishedAt: input.status === "published" ? timestamp : null });
        const taskId = Number(inserted[0].insertId);
        await db.insert(taskCurriculumUnits).values({ taskId, curriculumUnitId: topic[0].id });
        if (input.hints.length) await db.insert(taskHints).values(input.hints.map((hint, index) => ({ taskId, title: hint.title, bodyMarkdown: hint.bodyMarkdown, sortOrder: index + 1, createdAt: timestamp, updatedAt: timestamp })));
        if (input.solutionSteps.length) await db.insert(taskSolutionSteps).values(input.solutionSteps.map((step, index) => ({ taskId, title: step.title, bodyMarkdown: step.bodyMarkdown, sortOrder: index + 1, createdAt: timestamp, updatedAt: timestamp })));
        await recordTaskEvent(db, taskId, ctx.user.id, input.status === "published" ? "published" : "created", "Создание записи в банке.");
        return { taskId, internalId };
      }),
    updateTask: adminProcedure
      .input(adminTaskInput.safeExtend({ taskId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const { db, trackId, subjectId } = await getMathTrack();
        const [existing, topic, taskType] = await Promise.all([
          db.select({ id: tasks.id, contentVersion: tasks.contentVersion }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1),
          db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, input.topicSlug))).limit(1),
          db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, input.kimNumber))).limit(1),
        ]);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
        if (!topic[0] || !taskType[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверная тема или номер КИМ." });
        if (input.answerKind !== "manual" && !input.correctAnswer?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Для Части 1 нужен правильный ответ." });
        const timestamp = Date.now();
        await db.update(tasks).set({
          examTaskTypeId: taskType[0].id,
          slug: input.slug,
          title: input.title.trim(),
          statementMarkdown: input.statementMarkdown.trim(),
          answerKind: input.answerKind,
          correctAnswer: input.correctAnswer?.trim() || null,
          solutionMarkdown: input.solutionMarkdown.trim(),
          sourceKind: input.sourceKind,
          sourceTitle: input.sourceTitle.trim(),
          sourceUrl: input.sourceUrl?.trim() || null,
          sourceRecordId: input.sourceRecordId?.trim() || null,
          sourceAccessedAt: timestamp,
          sourceExamYear: input.sourceExamYear,
          status: input.status,
          contentVersion: existing[0].contentVersion + 1,
          publishedAt: input.status === "published" ? timestamp : null,
          updatedAt: timestamp,
        }).where(eq(tasks.id, input.taskId));
        await db.delete(taskCurriculumUnits).where(eq(taskCurriculumUnits.taskId, input.taskId));
        await db.insert(taskCurriculumUnits).values({ taskId: input.taskId, curriculumUnitId: topic[0].id });
        await db.delete(taskHints).where(eq(taskHints.taskId, input.taskId));
        await db.delete(taskSolutionSteps).where(eq(taskSolutionSteps.taskId, input.taskId));
        if (input.hints.length) await db.insert(taskHints).values(input.hints.map((hint, index) => ({ taskId: input.taskId, title: hint.title, bodyMarkdown: hint.bodyMarkdown, sortOrder: index + 1, createdAt: timestamp, updatedAt: timestamp })));
        if (input.solutionSteps.length) await db.insert(taskSolutionSteps).values(input.solutionSteps.map((step, index) => ({ taskId: input.taskId, title: step.title, bodyMarkdown: step.bodyMarkdown, sortOrder: index + 1, createdAt: timestamp, updatedAt: timestamp })));
        await recordTaskEvent(db, input.taskId, ctx.user.id, input.status === "published" ? "published" : "updated", "Обновление содержания или источника.");
        return { taskId: input.taskId };
      }),
    archiveTask: adminProcedure.input(taskLifecycleInput).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id, deletedAt: tasks.deletedAt }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1);
      if (!task || task.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена в активном архиве." });
      const timestamp = Date.now();
      await db.update(tasks).set({ status: "archived", archivedAt: timestamp, archivedReason: input.note || "Архивировано редактором.", updatedAt: timestamp }).where(eq(tasks.id, input.taskId));
      await recordTaskEvent(db, input.taskId, ctx.user.id, "archived", input.note);
      return { taskId: input.taskId };
    }),
    restoreTask: adminProcedure.input(taskLifecycleInput.extend({ status: z.enum(["draft", "review", "published"]).default("draft") })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id, deletedAt: tasks.deletedAt }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1);
      if (!task || task.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена или удалена." });
      const timestamp = Date.now();
      await db.update(tasks).set({ status: input.status, archivedAt: null, archivedReason: null, updatedAt: timestamp, publishedAt: input.status === "published" ? timestamp : null }).where(eq(tasks.id, input.taskId));
      await recordTaskEvent(db, input.taskId, ctx.user.id, "restored", input.note || `Восстановлено в статус ${input.status}.`);
      return { taskId: input.taskId };
    }),
    softDeleteTask: adminProcedure.input(taskLifecycleInput.extend({ note: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
      const timestamp = Date.now();
      await db.update(tasks).set({ status: "archived", deletedAt: timestamp, deletedReason: input.note, archivedAt: timestamp, archivedReason: "Мягкое удаление", updatedAt: timestamp }).where(eq(tasks.id, input.taskId));
      await recordTaskEvent(db, input.taskId, ctx.user.id, "soft_deleted", input.note);
      return { taskId: input.taskId };
    }),
    taskEvents: adminProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
      return db.select({ id: taskEditorialEvents.id, eventType: taskEditorialEvents.eventType, note: taskEditorialEvents.note, snapshot: taskEditorialEvents.snapshot, createdAt: taskEditorialEvents.createdAt, editorName: users.name }).from(taskEditorialEvents).leftJoin(users, eq(taskEditorialEvents.editorUserId, users.id)).where(eq(taskEditorialEvents.taskId, input.taskId)).orderBy(desc(taskEditorialEvents.createdAt));
    }),
    updateTaskSource: adminProcedure.input(z.object({ taskId: z.number().int().positive(), sourceKind: z.enum(["fipi", "partner"]), sourceTitle: z.string().trim().min(3).max(255), sourceUrl: z.string().url().max(1024), sourceRecordId: z.string().trim().max(255).optional(), sourceExamYear: z.number().int().min(2023).max(2026), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId), isNull(tasks.deletedAt))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Активная задача не найдена." });
      await db.update(tasks).set({ sourceKind: input.sourceKind, sourceTitle: input.sourceTitle.trim(), sourceUrl: input.sourceUrl.trim(), sourceRecordId: input.sourceRecordId?.trim() || null, sourceAccessedAt: Date.now(), sourceExamYear: input.sourceExamYear, updatedAt: Date.now() }).where(eq(tasks.id, input.taskId));
      await recordTaskEvent(db, input.taskId, ctx.user.id, "source_updated", input.note || "Источник обновлён.");
      return { taskId: input.taskId };
    }),
    addTaskDiagram: adminProcedure.input(z.object({ taskId: z.number().int().positive(), placement: z.enum(["statement", "solution"]).default("statement"), diagramKey: taskDiagramKey, altText: z.string().trim().min(5).max(1000), caption: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId), isNull(tasks.deletedAt))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Активная задача не найдена." });
      const [last] = await db.select({ sortOrder: taskVisuals.sortOrder }).from(taskVisuals).where(eq(taskVisuals.taskId, input.taskId)).orderBy(desc(taskVisuals.sortOrder)).limit(1);
      await db.insert(taskVisuals).values({ taskId: input.taskId, kind: "inline_svg", placement: input.placement, diagramKey: input.diagramKey, altText: input.altText, caption: input.caption || null, sourceKind: "author", reviewStatus: "approved", sortOrder: (last?.sortOrder ?? 0) + 1, createdAt: Date.now(), updatedAt: Date.now() });
      await recordTaskEvent(db, input.taskId, ctx.user.id, "media_added", `Добавлена схема ${input.diagramKey}.`);
      return { success: true };
    }),
    uploadTaskMedia: adminProcedure.input(taskMediaUploadInput).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId), isNull(tasks.deletedAt))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Активная задача не найдена." });
      if (input.sourceKind === "external" && !input.sourceUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Для внешнего изображения укажите URL источника." });
      const match = input.dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
      if (!match || match[1] !== input.contentType) throw new TRPCError({ code: "BAD_REQUEST", message: "Некорректный формат изображения." });
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Размер изображения должен быть не больше 5 МБ." });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const stored = await storagePut(`tasks/${input.taskId}/${Date.now()}-${safeName}`, bytes, input.contentType);
      const [last] = await db.select({ sortOrder: taskVisuals.sortOrder }).from(taskVisuals).where(eq(taskVisuals.taskId, input.taskId)).orderBy(desc(taskVisuals.sortOrder)).limit(1);
      const timestamp = Date.now();
      const inserted = await db.insert(taskVisuals).values({ taskId: input.taskId, kind: "image_asset", placement: input.placement, assetUrl: stored.url, altText: input.altText, caption: input.caption || null, sourceKind: input.sourceKind, sourceUrl: input.sourceUrl?.trim() || null, reviewStatus: input.sourceKind === "author" ? "approved" : "review", sortOrder: (last?.sortOrder ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp });
      await recordTaskEvent(db, input.taskId, ctx.user.id, "media_added", `Загружено изображение ${safeName}.`);
      return { visualId: Number(inserted[0].insertId), url: stored.url, reviewStatus: input.sourceKind === "author" ? "approved" as const : "review" as const };
    }),
    removeTaskMedia: adminProcedure.input(z.object({ taskId: z.number().int().positive(), visualId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { db, trackId } = await getMathTrack();
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.examTrackId, trackId))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена." });
      await db.delete(taskVisuals).where(and(eq(taskVisuals.id, input.visualId), eq(taskVisuals.taskId, input.taskId)));
      await recordTaskEvent(db, input.taskId, ctx.user.id, "media_removed", "Удалён визуальный материал.");
      return { success: true };
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
      const [relatedTasks, visuals] = await Promise.all([
        db.select({ id: tasks.id, title: tasks.title, slug: tasks.slug }).from(taskTheoryUnits).innerJoin(tasks, eq(taskTheoryUnits.taskId, tasks.id)).where(and(eq(taskTheoryUnits.theoryUnitId, unit.id), eq(tasks.examTrackId, trackId))),
        db.select({ id: theoryVisuals.id, kind: theoryVisuals.kind, placement: theoryVisuals.placement, diagramKey: theoryVisuals.diagramKey, assetUrl: theoryVisuals.assetUrl, altText: theoryVisuals.altText, caption: theoryVisuals.caption, reviewStatus: theoryVisuals.reviewStatus }).from(theoryVisuals).where(eq(theoryVisuals.theoryUnitId, unit.id)).orderBy(asc(theoryVisuals.sortOrder)),
      ]);
      return { ...unit, relatedTaskIds: relatedTasks.map(task => task.id), relatedTasks, visuals };
    }),
    createTheory: adminProcedure.input(adminTheoryInput).mutation(async ({ input, ctx }) => {
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
      await storeTheoryVersion(db, theoryUnitId, ctx.user.id, input.changeNote || "Создана первая редакция конспекта.");
      return { theoryUnitId };
    }),
    updateTheory: adminProcedure.input(adminTheoryInput.extend({ theoryUnitId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
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
      await storeTheoryVersion(db, input.theoryUnitId, ctx.user.id, input.changeNote || "Обновлена редакция конспекта.");
      return { theoryUnitId: input.theoryUnitId };
    }),
    theoryVersions: adminProcedure.input(z.object({ theoryUnitId: z.number().int().positive() })).query(async ({ input }) => {
      const { db, trackId } = await getMathTrack();
      const [allowed] = await db.select({ id: theoryUnits.id }).from(theoryExamTracks).innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id)).where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId))).limit(1);
      if (!allowed) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      return db.select({ id: theoryUnitVersions.id, version: theoryUnitVersions.version, changeNote: theoryUnitVersions.changeNote, createdAt: theoryUnitVersions.createdAt, editorName: users.name, snapshot: theoryUnitVersions.snapshot }).from(theoryUnitVersions).leftJoin(users, eq(theoryUnitVersions.createdByUserId, users.id)).where(eq(theoryUnitVersions.theoryUnitId, input.theoryUnitId)).orderBy(desc(theoryUnitVersions.version));
    }),
    uploadTheoryMedia: adminProcedure.input(theoryMediaUploadInput).mutation(async ({ input, ctx }) => {
      const { db, trackId } = await getMathTrack();
      const [allowed] = await db.select({ id: theoryUnits.id }).from(theoryExamTracks).innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id)).where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId))).limit(1);
      if (!allowed) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      const match = input.dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
      if (!match || match[1] !== input.contentType) throw new TRPCError({ code: "BAD_REQUEST", message: "Некорректный формат изображения." });
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Размер изображения должен быть не больше 5 МБ." });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const stored = await storagePut(`theory/${input.theoryUnitId}/${Date.now()}-${safeName}`, bytes, input.contentType);
      const [last] = await db.select({ sortOrder: theoryVisuals.sortOrder }).from(theoryVisuals).where(eq(theoryVisuals.theoryUnitId, input.theoryUnitId)).orderBy(desc(theoryVisuals.sortOrder)).limit(1);
      const timestamp = Date.now();
      const inserted = await db.insert(theoryVisuals).values({ theoryUnitId: input.theoryUnitId, kind: "image_asset", placement: input.placement, assetKey: stored.key, assetUrl: stored.url, altText: input.altText, caption: input.caption || null, sourceKind: "author", reviewStatus: "approved", sortOrder: (last?.sortOrder ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp });
      await storeTheoryVersion(db, input.theoryUnitId, ctx.user.id, "Добавлено изображение к конспекту.");
      return { visualId: Number(inserted[0].insertId), url: stored.url };
    }),
    addTheoryDiagram: adminProcedure.input(z.object({ theoryUnitId: z.number().int().positive(), placement: z.enum(["lead", "body"]).default("body"), diagramKey: theoryDiagramKey, altText: z.string().trim().min(5).max(1000), caption: z.string().trim().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const { db, trackId } = await getMathTrack();
      const [allowed, last] = await Promise.all([
        db.select({ id: theoryUnits.id }).from(theoryExamTracks).innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id)).where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId))).limit(1),
        db.select({ sortOrder: theoryVisuals.sortOrder }).from(theoryVisuals).where(eq(theoryVisuals.theoryUnitId, input.theoryUnitId)).orderBy(desc(theoryVisuals.sortOrder)).limit(1),
      ]);
      if (!allowed[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Конспект не найден." });
      const timestamp = Date.now();
      const inserted = await db.insert(theoryVisuals).values({ theoryUnitId: input.theoryUnitId, kind: "inline_svg", placement: input.placement, diagramKey: input.diagramKey, altText: input.altText, caption: input.caption || null, sourceKind: "author", reviewStatus: "approved", sortOrder: (last[0]?.sortOrder ?? 0) + 1, createdAt: timestamp, updatedAt: timestamp });
      await storeTheoryVersion(db, input.theoryUnitId, ctx.user.id, "Добавлена геометрическая схема.");
      return { visualId: Number(inserted[0].insertId) };
    }),
    removeTheoryMedia: adminProcedure.input(z.object({ theoryUnitId: z.number().int().positive(), visualId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const { db, trackId } = await getMathTrack();
      const [visual] = await db.select({ id: theoryVisuals.id }).from(theoryVisuals).innerJoin(theoryExamTracks, eq(theoryVisuals.theoryUnitId, theoryExamTracks.theoryUnitId)).where(and(eq(theoryVisuals.id, input.visualId), eq(theoryVisuals.theoryUnitId, input.theoryUnitId), eq(theoryExamTracks.examTrackId, trackId))).limit(1);
      if (!visual) throw new TRPCError({ code: "NOT_FOUND", message: "Визуальный материал не найден." });
      await db.delete(theoryVisuals).where(eq(theoryVisuals.id, input.visualId));
      await storeTheoryVersion(db, input.theoryUnitId, ctx.user.id, "Удалён визуальный материал.");
      return { success: true };
    }),
    restoreTheoryVersion: adminProcedure.input(z.object({ theoryUnitId: z.number().int().positive(), version: z.number().int().positive(), changeNote: z.string().trim().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const { db, trackId, subjectId } = await getMathTrack();
      const [allowed, versionRecord] = await Promise.all([
        db.select({ id: theoryUnits.id }).from(theoryExamTracks).innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id)).where(and(eq(theoryExamTracks.examTrackId, trackId), eq(theoryUnits.id, input.theoryUnitId))).limit(1),
        db.select({ snapshot: theoryUnitVersions.snapshot }).from(theoryUnitVersions).where(and(eq(theoryUnitVersions.theoryUnitId, input.theoryUnitId), eq(theoryUnitVersions.version, input.version))).limit(1),
      ]);
      if (!allowed[0] || !versionRecord[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Редакция конспекта не найдена." });
      const snapshot = versionRecord[0].snapshot;
      const [topic, taskType, linkedTasks] = await Promise.all([
        db.select({ id: curriculumUnits.id }).from(curriculumUnits).where(and(eq(curriculumUnits.subjectId, subjectId), eq(curriculumUnits.slug, snapshot.topicSlug))).limit(1),
        db.select({ id: examTaskTypes.id }).from(examTaskTypes).where(and(eq(examTaskTypes.examTrackId, trackId), eq(examTaskTypes.kimNumber, snapshot.kimNumber))).limit(1),
        snapshot.relatedTaskIds.length ? db.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, snapshot.relatedTaskIds), eq(tasks.examTrackId, trackId))) : Promise.resolve([]),
      ]);
      if (!topic[0] || !taskType[0] || linkedTasks.length !== snapshot.relatedTaskIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Эту версию нельзя восстановить: связанные данные изменились." });
      const timestamp = Date.now();
      await db.update(theoryUnits).set({ title: snapshot.title, slug: snapshot.slug, lead: snapshot.lead, bodyMarkdown: snapshot.bodyMarkdown, sourceKind: snapshot.sourceKind, sourceTitle: snapshot.sourceTitle ?? null, sourceUrl: snapshot.sourceUrl ?? null, contentVersion: sql`${theoryUnits.contentVersion} + 1`, updatedAt: timestamp }).where(eq(theoryUnits.id, input.theoryUnitId));
      await db.delete(theoryCurriculumUnits).where(eq(theoryCurriculumUnits.theoryUnitId, input.theoryUnitId));
      await db.delete(theoryTaskTypes).where(eq(theoryTaskTypes.theoryUnitId, input.theoryUnitId));
      await db.delete(taskTheoryUnits).where(eq(taskTheoryUnits.theoryUnitId, input.theoryUnitId));
      await db.delete(theoryVisuals).where(eq(theoryVisuals.theoryUnitId, input.theoryUnitId));
      await db.insert(theoryCurriculumUnits).values({ theoryUnitId: input.theoryUnitId, curriculumUnitId: topic[0].id });
      await db.insert(theoryTaskTypes).values({ theoryUnitId: input.theoryUnitId, examTaskTypeId: taskType[0].id });
      if (snapshot.relatedTaskIds.length) await db.insert(taskTheoryUnits).values(snapshot.relatedTaskIds.map(taskId => ({ taskId, theoryUnitId: input.theoryUnitId })));
      if (snapshot.visuals.length) await db.insert(theoryVisuals).values(snapshot.visuals.map((visual, index) => ({ theoryUnitId: input.theoryUnitId, kind: visual.kind, placement: visual.placement, diagramKey: visual.diagramKey ?? null, assetUrl: visual.assetUrl ?? null, altText: visual.altText, caption: visual.caption ?? null, sourceKind: "author" as const, reviewStatus: "approved" as const, sortOrder: index, createdAt: timestamp, updatedAt: timestamp })));
      await storeTheoryVersion(db, input.theoryUnitId, ctx.user.id, input.changeNote || `Восстановлена редакция ${input.version}.`);
      return { theoryUnitId: input.theoryUnitId };
    }),
  }),
});
