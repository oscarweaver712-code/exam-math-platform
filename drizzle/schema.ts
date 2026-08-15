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
    title: varchar("title", { length: 220 }).notNull(),
    statementMarkdown: text("statementMarkdown").notNull(),
    answerChoices: json("answerChoices").$type<TaskChoice[]>(),
    answerKind: mysqlEnum("answerKind", ["short_integer", "short_decimal", "short_text", "manual"])
      .notNull(),
    correctAnswer: varchar("correctAnswer", { length: 1024 }),
    acceptableAnswers: json("acceptableAnswers").$type<string[]>(),
    solutionMarkdown: text("solutionMarkdown").notNull(),
    difficulty: mysqlEnum("difficulty", ["basic", "standard", "advanced"])
      .default("standard")
      .notNull(),
    sourceKind: mysqlEnum("sourceKind", ["author", "fipi", "partner"])
      .default("author")
      .notNull(),
    sourceUrl: varchar("sourceUrl", { length: 1024 }),
    sourceRecordId: varchar("sourceRecordId", { length: 255 }),
    contentVersion: int("contentVersion").default(1).notNull(),
    status: mysqlEnum("status", ["draft", "review", "published", "archived"])
      .default("draft")
      .notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
    publishedAt: bigint("publishedAt", { mode: "number" }),
  },
  table => [
    uniqueIndex("tasks_track_slug_unique").on(table.examTrackId, table.slug),
    index("tasks_public_catalog_idx").on(table.examTrackId, table.status, table.difficulty),
    index("tasks_task_type_idx").on(table.examTaskTypeId),
  ],
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
