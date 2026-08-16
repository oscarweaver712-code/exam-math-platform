import {
  bigint,
  boolean,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core identity record backed by the platform OAuth layer. Product-specific
 * learning roles are stored separately in `platformProfiles` so that the
 * built-in administrator role remains independent from student/tutor access.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type TheoryVersionSnapshot = {
  title: string;
  slug: string;
  lead: string;
  bodyMarkdown: string;
  topicSlug: string;
  kimNumber: string;
  relatedTaskIds: number[];
  sourceKind: "author" | "licensed" | "external_reference";
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  visuals: Array<{ kind: "inline_svg" | "image_asset"; placement: "lead" | "body"; diagramKey?: string | null; assetUrl?: string | null; altText: string; caption?: string | null }>;
};

/** A school subject, for example mathematics, physics, or Russian language. */
export const subjects = mysqlTable(
  "subjects",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    shortTitle: varchar("shortTitle", { length: 80 }).notNull(),
    description: text("description"),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("subjects_slug_unique").on(table.slug)],
);

/** A named exam path under a subject, such as ОГЭ or ЕГЭ профиль. */
export const examTracks = mysqlTable(
  "exam_tracks",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    examKind: mysqlEnum("examKind", ["oge", "ege", "other"]).notNull(),
    description: text("description"),
    isPrototype: boolean("isPrototype").default(false).notNull(),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("exam_tracks_subject_slug_unique").on(table.subjectId, table.slug),
    index("exam_tracks_subject_idx").on(table.subjectId),
  ],
);

/**
 * Shared curriculum taxonomy. Parent IDs enable a subject-specific hierarchy
 * such as «Алгебра → Уравнения → Квадратные уравнения».
 */
export const curriculumUnits = mysqlTable(
  "curriculum_units",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    parentId: int("parentId"),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    sortOrder: int("sortOrder").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("curriculum_units_subject_slug_unique").on(table.subjectId, table.slug),
    index("curriculum_units_subject_parent_idx").on(table.subjectId, table.parentId),
  ],
);

/** A numbered type of task in a specific exam's КИМ structure. */
export const examTaskTypes = mysqlTable(
  "exam_task_types",
  {
    id: int("id").autoincrement().primaryKey(),
    examTrackId: int("examTrackId")
      .notNull()
      .references(() => examTracks.id, { onDelete: "cascade" }),
    kimNumber: varchar("kimNumber", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    part: mysqlEnum("part", ["part1", "part2"]).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    description: text("description"),
    requiresVisual: boolean("requiresVisual").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("exam_task_types_track_kim_unique").on(table.examTrackId, table.kimNumber),
    index("exam_task_types_track_part_idx").on(table.examTrackId, table.part),
  ],
);

/** Many-to-many mapping between an exam track and its curriculum units. */
export const examTrackCurriculumUnits = mysqlTable(
  "exam_track_curriculum_units",
  {
    examTrackId: int("examTrackId")
      .notNull()
      .references(() => examTracks.id, { onDelete: "cascade" }),
    curriculumUnitId: int("curriculumUnitId").notNull(),
  },
  table => [
    primaryKey({ columns: [table.examTrackId, table.curriculumUnitId] }),
    foreignKey({
      name: "etcu_curriculum_fk",
      columns: [table.curriculumUnitId],
      foreignColumns: [curriculumUnits.id],
    }).onDelete("cascade"),
    index("track_curriculum_unit_idx").on(table.curriculumUnitId),
  ],
);

/** Many-to-many mapping between КИМ task types and curriculum units. */
export const taskTypeCurriculumUnits = mysqlTable(
  "task_type_curriculum_units",
  {
    examTaskTypeId: int("examTaskTypeId")
      .notNull()
      .references(() => examTaskTypes.id, { onDelete: "cascade" }),
    curriculumUnitId: int("curriculumUnitId").notNull(),
  },
  table => [
    primaryKey({ columns: [table.examTaskTypeId, table.curriculumUnitId] }),
    foreignKey({
      name: "ttcu_curriculum_fk",
      columns: [table.curriculumUnitId],
      foreignColumns: [curriculumUnits.id],
    }).onDelete("cascade"),
    index("task_type_curriculum_unit_idx").on(table.curriculumUnitId),
  ],
);

/** An editorially managed public theory article or micro-lesson. */
export const theoryUnits = mysqlTable(
  "theory_units",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 140 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    lead: text("lead").notNull(),
    bodyMarkdown: text("bodyMarkdown").notNull(),
    sourceKind: mysqlEnum("sourceKind", ["author", "licensed", "external_reference"])
      .default("author")
      .notNull(),
    sourceTitle: varchar("sourceTitle", { length: 255 }),
    sourceUrl: varchar("sourceUrl", { length: 1024 }),
    contentVersion: int("contentVersion").default(1).notNull(),
    status: mysqlEnum("status", ["draft", "review", "published", "archived"])
      .default("draft")
      .notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
    publishedAt: bigint("publishedAt", { mode: "number" }),
  },
  table => [
    uniqueIndex("theory_units_subject_slug_unique").on(table.subjectId, table.slug),
    index("theory_units_subject_status_idx").on(table.subjectId, table.status),
  ],
);

export const theoryExamTracks = mysqlTable(
  "theory_exam_tracks",
  {
    theoryUnitId: int("theoryUnitId")
      .notNull()
      .references(() => theoryUnits.id, { onDelete: "cascade" }),
    examTrackId: int("examTrackId")
      .notNull()
      .references(() => examTracks.id, { onDelete: "cascade" }),
  },
  table => [
    primaryKey({ columns: [table.theoryUnitId, table.examTrackId] }),
    index("theory_exam_tracks_track_idx").on(table.examTrackId),
  ],
);

export const theoryCurriculumUnits = mysqlTable(
  "theory_curriculum_units",
  {
    theoryUnitId: int("theoryUnitId")
      .notNull()
      .references(() => theoryUnits.id, { onDelete: "cascade" }),
    curriculumUnitId: int("curriculumUnitId").notNull(),
  },
  table => [
    primaryKey({ columns: [table.theoryUnitId, table.curriculumUnitId] }),
    foreignKey({
      name: "thcu_curriculum_fk",
      columns: [table.curriculumUnitId],
      foreignColumns: [curriculumUnits.id],
    }).onDelete("cascade"),
    index("theory_curriculum_units_unit_idx").on(table.curriculumUnitId),
  ],
);

export const theoryTaskTypes = mysqlTable(
  "theory_task_types",
  {
    theoryUnitId: int("theoryUnitId")
      .notNull()
      .references(() => theoryUnits.id, { onDelete: "cascade" }),
    examTaskTypeId: int("examTaskTypeId")
      .notNull()
      .references(() => examTaskTypes.id, { onDelete: "cascade" }),
  },
  table => [
    primaryKey({ columns: [table.theoryUnitId, table.examTaskTypeId] }),
    index("theory_task_types_task_type_idx").on(table.examTaskTypeId),
  ],
);

/** Ordered visual aids used by theory units. Asset files live in object storage. */
export const theoryVisuals = mysqlTable(
  "theory_visuals",
  {
    id: int("id").autoincrement().primaryKey(),
    theoryUnitId: int("theoryUnitId").notNull().references(() => theoryUnits.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["inline_svg", "image_asset"]).notNull(),
    placement: mysqlEnum("placement", ["lead", "body"]).default("body").notNull(),
    diagramKey: varchar("diagramKey", { length: 120 }),
    assetKey: varchar("assetKey", { length: 2048 }),
    assetUrl: varchar("assetUrl", { length: 2048 }),
    altText: text("altText").notNull(),
    caption: varchar("caption", { length: 500 }),
    sourceKind: mysqlEnum("sourceKind", ["author", "external"]).default("author").notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }),
    reviewStatus: mysqlEnum("reviewStatus", ["draft", "review", "approved", "rejected"]).default("draft").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("theory_visuals_unit_placement_idx").on(table.theoryUnitId, table.placement, table.sortOrder), index("theory_visuals_review_idx").on(table.reviewStatus)],
);

/** Immutable editorial snapshots, allowing a reviewable rollback without destructive data loss. */
export const theoryUnitVersions = mysqlTable(
  "theory_unit_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    theoryUnitId: int("theoryUnitId").notNull().references(() => theoryUnits.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    snapshot: json("snapshot").$type<TheoryVersionSnapshot>().notNull(),
    changeNote: varchar("changeNote", { length: 500 }),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("theory_versions_unit_version_unique").on(table.theoryUnitId, table.version), index("theory_versions_unit_created_idx").on(table.theoryUnitId, table.createdAt)],
);

/** A restrained, editor-controlled promotion for the school’s own learning events. */
export const learningPromos = mysqlTable(
  "learning_promos",
  {
    id: int("id").autoincrement().primaryKey(),
    examTrackId: int("examTrackId").references(() => examTracks.id, { onDelete: "cascade" }),
    placement: mysqlEnum("placement", ["theory", "bank", "homework"]).default("theory").notNull(),
    eyebrow: varchar("eyebrow", { length: 140 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description").notNull(),
    ctaLabel: varchar("ctaLabel", { length: 120 }).notNull(),
    ctaUrl: varchar("ctaUrl", { length: 1024 }).notNull(),
    isActive: boolean("isActive").default(false).notNull(),
    startsAt: bigint("startsAt", { mode: "number" }),
    endsAt: bigint("endsAt", { mode: "number" }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    index("learning_promos_track_placement_active_idx").on(table.examTrackId, table.placement, table.isActive),
  ],
);

/** A private completion marker for one user's theory unit. */
export const userTheoryProgress = mysqlTable(
  "user_theory_progress",
  {
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    theoryUnitId: int("theoryUnitId")
      .notNull()
      .references(() => theoryUnits.id, { onDelete: "cascade" }),
    completedAt: bigint("completedAt", { mode: "number" }).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.theoryUnitId] }),
    index("user_theory_progress_theory_idx").on(table.theoryUnitId),
  ],
);

export type TaskChoice = { id: string; label: string };

/**
 * Public task content. A task belongs to one displayed КИМ type in the first
 * version but can be linked to many topics and theory units.
 */
export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    examTrackId: int("examTrackId")
      .notNull()
      .references(() => examTracks.id, { onDelete: "restrict" }),
    examTaskTypeId: int("examTaskTypeId")
      .notNull()
      .references(() => examTaskTypes.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    /** Server-generated immutable editorial identifier; it is never accepted from editor input. */
    internalId: varchar("internalId", { length: 64 }).notNull(),
    /** Human-readable, automatically assigned sequential number within the task bank. */
    catalogNumber: int("catalogNumber"),
    title: varchar("title", { length: 220 }).notNull(),
    statementMarkdown: text("statementMarkdown").notNull(),
    answerChoices: json("answerChoices").$type<TaskChoice[]>(),
    answerKind: mysqlEnum("answerKind", ["short_integer", "short_decimal", "short_text", "manual"])
      .notNull(),
    correctAnswer: varchar("correctAnswer", { length: 1024 }),
    acceptableAnswers: json("acceptableAnswers").$type<string[]>(),
    solutionMarkdown: text("solutionMarkdown").notNull(),
    sourceKind: mysqlEnum("sourceKind", ["author", "fipi", "partner"])
      .default("author")
      .notNull(),
    sourceTitle: varchar("sourceTitle", { length: 255 }),
    sourceUrl: varchar("sourceUrl", { length: 1024 }),
    sourceRecordId: varchar("sourceRecordId", { length: 255 }),
    sourceAccessedAt: bigint("sourceAccessedAt", { mode: "number" }),
    sourceExamYear: int("sourceExamYear"),
    contentVersion: int("contentVersion").default(1).notNull(),
    status: mysqlEnum("status", ["draft", "review", "published", "archived"])
      .default("draft")
      .notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
    publishedAt: bigint("publishedAt", { mode: "number" }),
    archivedAt: bigint("archivedAt", { mode: "number" }),
    archivedReason: varchar("archivedReason", { length: 500 }),
    deletedAt: bigint("deletedAt", { mode: "number" }),
    deletedReason: varchar("deletedReason", { length: 500 }),
  },
  table => [
    uniqueIndex("tasks_track_slug_unique").on(table.examTrackId, table.slug),
    uniqueIndex("tasks_internal_id_unique").on(table.internalId),
    uniqueIndex("tasks_catalog_number_unique").on(table.catalogNumber),
    index("tasks_public_catalog_idx").on(table.examTrackId, table.status, table.examTaskTypeId),
    index("tasks_task_type_idx").on(table.examTaskTypeId),
    index("tasks_source_year_idx").on(table.sourceExamYear, table.sourceKind),
  ],
);

/** Owner-governed editorial access. Revocation keeps the user account and learning data intact. */
export const editorialAccessRoles = mysqlTable(
  "editorial_access_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "admin", "editor"]).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    grantedByUserId: int("grantedByUserId").references(() => users.id, { onDelete: "set null" }),
    revokedByUserId: int("revokedByUserId").references(() => users.id, { onDelete: "set null" }),
    revokedAt: bigint("revokedAt", { mode: "number" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("editorial_access_roles_user_unique").on(table.userId),
    index("editorial_access_roles_active_idx").on(table.isActive, table.role),
  ],
);

/** A manually registered external-content case. It must clear rights review before a task draft can be created. */
export const contentImportCases = mysqlTable(
  "content_import_cases",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "restrict" }),
    examTrackId: int("examTrackId").notNull().references(() => examTracks.id, { onDelete: "restrict" }),
    examTaskTypeId: int("examTaskTypeId").notNull().references(() => examTaskTypes.id, { onDelete: "restrict" }),
    sourceKind: mysqlEnum("sourceKind", ["fipi", "partner"]).notNull(),
    sourceTitle: varchar("sourceTitle", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
    sourceRecordId: varchar("sourceRecordId", { length: 255 }),
    sourceAccessedAt: bigint("sourceAccessedAt", { mode: "number" }).notNull(),
    sourceExamYear: int("sourceExamYear").notNull(),
    proposedTitle: varchar("proposedTitle", { length: 220 }).notNull(),
    sourceSummary: text("sourceSummary").notNull(),
    plannedAdaptation: text("plannedAdaptation").notNull(),
    rightsBasis: varchar("rightsBasis", { length: 500 }),
    rightsEvidenceUrl: varchar("rightsEvidenceUrl", { length: 1024 }),
    status: mysqlEnum("status", ["rights_review", "cleared", "rejected", "converted"]).default("rights_review").notNull(),
    legalReviewNote: text("legalReviewNote"),
    submittedByUserId: int("submittedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    assignedEditorUserId: int("assignedEditorUserId").references(() => users.id, { onDelete: "set null" }),
    assignedByUserId: int("assignedByUserId").references(() => users.id, { onDelete: "set null" }),
    assignedAt: bigint("assignedAt", { mode: "number" }),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: bigint("reviewedAt", { mode: "number" }),
    convertedTaskId: int("convertedTaskId").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    index("content_import_cases_track_status_idx").on(table.examTrackId, table.status, table.createdAt),
    index("content_import_cases_assignment_idx").on(table.examTrackId, table.status, table.assignedEditorUserId, table.createdAt),
    index("content_import_cases_type_idx").on(table.examTaskTypeId),
    uniqueIndex("content_import_cases_converted_task_unique").on(table.convertedTaskId),
  ],
);

/** Immutable decisions for manual external-content intake. */
export const contentImportEvents = mysqlTable(
  "content_import_events",
  {
    id: int("id").autoincrement().primaryKey(),
    importCaseId: int("importCaseId").notNull().references(() => contentImportCases.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    eventType: mysqlEnum("eventType", ["submitted", "assigned", "rights_cleared", "rejected", "converted"]).notNull(),
    note: text("note"),
    snapshot: json("snapshot").$type<Record<string, unknown>>(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [index("content_import_events_case_created_idx").on(table.importCaseId, table.createdAt)],
);

/** Immutable record of editorial actions for a task. Soft deletion preserves this audit trail. */
export const taskEditorialEvents = mysqlTable(
  "task_editorial_events",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    editorUserId: int("editorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    eventType: mysqlEnum("eventType", ["created", "updated", "published", "archived", "restored", "soft_deleted", "source_updated", "media_added", "media_approved", "media_rejected", "media_removed"])
      .notNull(),
    note: varchar("note", { length: 500 }),
    snapshot: json("snapshot").$type<Record<string, unknown>>(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [index("task_editorial_events_task_created_idx").on(table.taskId, table.createdAt)],
);

/**
 * Ordered visual materials belonging to a task. Inline SVG diagrams are
 * referenced by a controlled component key, while image assets are served
 * from object storage after source and editorial review.
 */
export const taskVisuals = mysqlTable(
  "task_visuals",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["inline_svg", "image_asset"]).notNull(),
    placement: mysqlEnum("placement", ["statement", "supplement", "solution"]).default("statement").notNull(),
    diagramKey: varchar("diagramKey", { length: 120 }),
    assetUrl: varchar("assetUrl", { length: 2048 }),
    altText: text("altText").notNull(),
    caption: varchar("caption", { length: 500 }),
    sourceKind: mysqlEnum("sourceKind", ["author", "external"]).default("author").notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }),
    reviewStatus: mysqlEnum("reviewStatus", ["draft", "review", "approved", "rejected"]).default("draft").notNull(),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: bigint("reviewedAt", { mode: "number" }),
    reviewNote: text("reviewNote"),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    index("task_visuals_task_placement_idx").on(table.taskId, table.placement, table.sortOrder),
    index("task_visuals_review_idx").on(table.reviewStatus),
  ],
);

/** A fixed examination-style set assembled from published author tasks. */
export const examVariants = mysqlTable(
  "exam_variants",
  {
    id: int("id").autoincrement().primaryKey(),
    examTrackId: int("examTrackId").notNull().references(() => examTracks.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    origin: mysqlEnum("origin", ["monthly", "manual"]).default("monthly").notNull(),
    monthKey: varchar("monthKey", { length: 7 }),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
    generatedAt: bigint("generatedAt", { mode: "number" }).notNull(),
    publishedAt: bigint("publishedAt", { mode: "number" }),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("exam_variants_track_slug_unique").on(table.examTrackId, table.slug),
    uniqueIndex("exam_variants_track_month_unique").on(table.examTrackId, table.monthKey),
    index("exam_variants_track_status_published_idx").on(table.examTrackId, table.status, table.publishedAt),
  ],
);

/** Frozen membership and ordering of one generated examination variant. */
export const examVariantItems = mysqlTable(
  "exam_variant_items",
  {
    id: int("id").autoincrement().primaryKey(),
    examVariantId: int("examVariantId").notNull().references(() => examVariants.id, { onDelete: "cascade" }),
    taskId: int("taskId").notNull().references(() => tasks.id, { onDelete: "restrict" }),
    taskContentVersion: int("taskContentVersion").notNull(),
    sortOrder: int("sortOrder").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("exam_variant_items_variant_task_unique").on(table.examVariantId, table.taskId),
    uniqueIndex("exam_variant_items_variant_order_unique").on(table.examVariantId, table.sortOrder),
    index("exam_variant_items_task_idx").on(table.taskId),
  ],
);

/** Durable owner-managed configuration for a project-level monthly variant job. */
export const variantGenerationSchedules = mysqlTable(
  "variant_generation_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    examTrackId: int("examTrackId").notNull().references(() => examTracks.id, { onDelete: "cascade" }),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    lastGeneratedMonthKey: varchar("lastGeneratedMonthKey", { length: 7 }),
    lastGeneratedAt: bigint("lastGeneratedAt", { mode: "number" }),
    lastError: text("lastError"),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("variant_generation_schedules_track_unique").on(table.examTrackId)],
);

/** Progressive help that learners reveal intentionally before seeing a full solution. */
export const taskHints = mysqlTable(
  "task_hints",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    bodyMarkdown: text("bodyMarkdown").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("task_hints_task_order_idx").on(table.taskId, table.sortOrder)],
);

/** Ordered explanation blocks for the full solution after the learner elects to review it. */
export const taskSolutionSteps = mysqlTable(
  "task_solution_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    bodyMarkdown: text("bodyMarkdown").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("task_solution_steps_task_order_idx").on(table.taskId, table.sortOrder)],
);

/** Optional text or LaTeX conditions that learners reveal only when they need extra context. */
export const taskAdditionalMaterials = mysqlTable(
  "task_additional_materials",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    bodyMarkdown: text("bodyMarkdown").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("task_additional_materials_task_order_idx").on(table.taskId, table.sortOrder)],
);

export const taskCurriculumUnits = mysqlTable(
  "task_curriculum_units",
  {
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    curriculumUnitId: int("curriculumUnitId").notNull(),
  },
  table => [
    primaryKey({ columns: [table.taskId, table.curriculumUnitId] }),
    foreignKey({
      name: "tcu_curriculum_fk",
      columns: [table.curriculumUnitId],
      foreignColumns: [curriculumUnits.id],
    }).onDelete("cascade"),
    index("task_curriculum_units_unit_idx").on(table.curriculumUnitId),
  ],
);

export const taskTheoryUnits = mysqlTable(
  "task_theory_units",
  {
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    theoryUnitId: int("theoryUnitId")
      .notNull()
      .references(() => theoryUnits.id, { onDelete: "cascade" }),
  },
  table => [
    primaryKey({ columns: [table.taskId, table.theoryUnitId] }),
    index("task_theory_units_theory_idx").on(table.theoryUnitId),
  ],
);

/** Product role chosen once during a user's first authenticated experience. */
export const platformProfiles = mysqlTable(
  "platform_profiles",
  {
    userId: int("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    learningRole: mysqlEnum("learningRole", ["unselected", "student", "tutor"])
      .default("unselected")
      .notNull(),
    displayName: varchar("displayName", { length: 160 }),
    roleChosenAt: bigint("roleChosenAt", { mode: "number" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
);

/** Subjects a tutor can teach; it enables a future multidisciplinary school. */
export const tutorSubjectSpecialties = mysqlTable(
  "tutor_subject_specialties",
  {
    tutorUserId: int("tutorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.tutorUserId, table.subjectId] }),
    index("tutor_specialties_subject_idx").on(table.subjectId),
  ],
);

/** A controlled relationship between a tutor and student for one subject. */
export const tutorStudentLinks = mysqlTable(
  "tutor_student_links",
  {
    id: int("id").autoincrement().primaryKey(),
    tutorUserId: int("tutorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentUserId: int("studentUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "active", "archived"])
      .default("pending")
      .notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("tutor_student_invite_code_unique").on(table.inviteCode),
    uniqueIndex("tutor_student_subject_unique").on(table.tutorUserId, table.studentUserId, table.subjectId),
    index("tutor_student_student_subject_idx").on(table.studentUserId, table.subjectId),
  ],
);

/** Tasks a signed-in learner has saved for later practice. */
export const savedTasks = mysqlTable(
  "saved_tasks",
  {
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.taskId] }),
    index("saved_tasks_task_idx").on(table.taskId),
  ],
);

/** A tutor-created collection of tasks for a linked student. */
export const homeworkAssignments = mysqlTable(
  "homework_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    tutorUserId: int("tutorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    studentUserId: int("studentUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectId: int("subjectId")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 220 }).notNull(),
    note: text("note"),
    dueAt: bigint("dueAt", { mode: "number" }),
    status: mysqlEnum("status", ["draft", "assigned", "closed", "archived"])
      .default("draft")
      .notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    index("homework_student_status_due_idx").on(table.studentUserId, table.status, table.dueAt),
    index("homework_tutor_status_idx").on(table.tutorUserId, table.status),
  ],
);

export const homeworkItems = mysqlTable(
  "homework_items",
  {
    id: int("id").autoincrement().primaryKey(),
    homeworkAssignmentId: int("homeworkAssignmentId")
      .notNull()
      .references(() => homeworkAssignments.id, { onDelete: "cascade" }),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    taskContentVersion: int("taskContentVersion").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("homework_items_assignment_task_unique").on(table.homeworkAssignmentId, table.taskId),
    index("homework_items_task_idx").on(table.taskId),
  ],
);

/**
 * An immutable answer attempt. Part 1 is auto-checked; Part 2 becomes a
 * reviewable attempt and does not enter automatic correctness calculations.
 */
export const taskAttempts = mysqlTable(
  "task_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    homeworkItemId: int("homeworkItemId").references(() => homeworkItems.id, {
      onDelete: "set null",
    }),
    rawAnswer: text("rawAnswer").notNull(),
    normalizedAnswer: varchar("normalizedAnswer", { length: 1024 }),
    checkStatus: mysqlEnum("checkStatus", ["correct", "incorrect", "awaiting_review", "reviewed"])
      .notNull(),
    isCorrect: boolean("isCorrect"),
    feedback: text("feedback"),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: bigint("submittedAt", { mode: "number" }).notNull(),
    reviewedAt: bigint("reviewedAt", { mode: "number" }),
  },
  table => [
    index("task_attempts_user_task_submitted_idx").on(table.userId, table.taskId, table.submittedAt),
    index("task_attempts_homework_item_idx").on(table.homeworkItemId),
  ],
);
