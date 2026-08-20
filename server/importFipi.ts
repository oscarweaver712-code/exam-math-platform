/**
 * Imports the ФИПИ bank produced by `tools/fipi` into the database.
 *
 *   pnpm import:fipi                      # tasks only
 *   pnpm import:fipi -- --with-images     # also upload the diagrams
 *   pnpm import:fipi -- --limit 50        # a small slice, for a first look
 *   pnpm import:fipi -- --tasks /data/import/out/tasks.jsonl \
 *                       --images /data/import/out/images
 *
 * Idempotent: the ФИПИ question GUID is stored in `tasks.sourceRecordId`, and
 * a task whose GUID is already present is updated rather than inserted again.
 * Re-running after re-classifying is therefore safe and cheap.
 *
 * The importer deliberately does *not* invent content. ФИПИ publishes neither
 * answers nor worked solutions: a key appears only if `answers.jsonl` carries
 * one confirmed against the bank's own checker, and a new task starts with an
 * explicit placeholder where its разбор will go.
 *
 * Re-running never undoes editorial work. Keys and разборы also arrive through
 * the admin, and this file is not their source of truth: an existing task keeps
 * its разбор, and keeps its key unless this run has one for it.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  examTaskTypes,
  examTracks,
  subjects,
  taskAdditionalMaterials,
  taskVisuals,
  tasks,
} from "../drizzle/schema";
import { SOLUTION_PLACEHOLDER } from "@shared/const";
import { getDb } from "./db";
import { storagePut } from "./storage";

const DEFAULT_TASKS_FILE = "tools/fipi/out/tasks.jsonl";
const DEFAULT_IMAGES_DIR = "tools/fipi/out/images";
const DEFAULT_ANSWERS_FILE = "tools/fipi/out/answers.jsonl";

const SUBJECT_SLUG = "mathematics";
const TRACK_SLUG = "oge-mathematics";

/** Bucket for the flattened practical block: the bank does not say which of 1–5. */
const PRACTICAL_BLOCK_KIM = "1–5";
/**
 * Bucket for the part 2 geometry pair. Positions 23 and 25 ask for the same
 * thing — a length or an area, worked out and written down — and differ only in
 * difficulty, which the bank does not publish. Putting these questions under a
 * single number would be a coin toss printed as fact.
 */
const GEOMETRY_PAIR_KIM = "23/25";
/** Bucket for everything the classifier could not resolve. */
const UNSORTED_KIM = "0";



type ClassifiedTask = {
  guid: string;
  short_id: string;
  statement_text: string;
  statement_html: string;
  answer_kind: string;
  answer_label: string;
  kes_codes: string[];
  kes_titles: string[];
  choices: Array<{ value: string; text: string }>;
  images: string[];
  /** Subset of `images` that sits inside a sentence: a formula drawn as a GIF. */
  inline_images?: string[];
  image_urls: string[];
  group_id: string | null;
  group_position: number | null;
  group_intro: string;
  group_images: string[];
  /** Subset of `group_images` drawn inside the shared text. */
  group_inline_images?: string[];
  oge_number: number | null;
  /** Pre-computed exam-position label, used directly when present (ЕГЭ). */
  kim_number?: string;
  oge_title: string;
  url: string;
  classification: {
    number: number | null;
    confidence: string;
    method: string;
    candidates: number[];
  };
};

type Args = {
  withImages: boolean;
  limit: number | null;
  status: "draft" | "review" | "published";
  /** Overridable so the same script runs locally or against a mounted volume. */
  tasksFile: string;
  imagesDir: string;
  answersFile: string;
  trackSlug: string;
  sourceTitle: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    withImages: false,
    limit: null,
    status: "published",
    tasksFile: DEFAULT_TASKS_FILE,
    imagesDir: DEFAULT_IMAGES_DIR,
    answersFile: DEFAULT_ANSWERS_FILE,
    trackSlug: "oge-mathematics",
    sourceTitle: "Открытый банк заданий ОГЭ, ФИПИ",
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--with-images") args.withImages = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--tasks") args.tasksFile = argv[++i];
    else if (argv[i] === "--images") args.imagesDir = argv[++i];
    else if (argv[i] === "--answers") args.answersFile = argv[++i];
    else if (argv[i] === "--track") args.trackSlug = argv[++i];
    else if (argv[i] === "--source-title") args.sourceTitle = argv[++i];
    else if (argv[i] === "--status") {
      const value = argv[++i];
      if (value === "draft" || value === "review" || value === "published") args.status = value;
    }
  }
  return args;
}

async function* readTasks(
  tasksFile: string,
  limit: number | null,
): AsyncGenerator<ClassifiedTask> {
  const stream = readline.createInterface({
    input: fs.createReadStream(tasksFile, "utf-8"),
    crlfDelay: Infinity,
  });
  let yielded = 0;
  for await (const line of stream) {
    if (!line.trim()) continue;
    if (limit !== null && yielded >= limit) break;
    yielded += 1;
    yield JSON.parse(line) as ClassifiedTask;
  }
  stream.close();
}

/** Which КИМ bucket a classified task belongs in. */
function kimNumberFor(task: ClassifiedTask): string {
  if (task.kim_number) return task.kim_number;
  if (task.oge_number !== null) return String(task.oge_number);
  const candidates = task.classification.candidates ?? [];
  const isPracticalBlock =
    candidates.length === 5 && candidates.every((n, i) => n === i + 1);
  if (isPracticalBlock) return PRACTICAL_BLOCK_KIM;
  const isGeometryPair =
    candidates.length === 2 && candidates[0] === 23 && candidates[1] === 25;
  return isGeometryPair ? GEOMETRY_PAIR_KIM : UNSORTED_KIM;
}

/**
 * ФИПИ answer types mapped onto ours. Every short form becomes `short_text`:
 * we have no answer key, so claiming an integer or decimal shape would be a
 * guess the validator would later enforce.
 */
function answerKindFor(task: ClassifiedTask): "short_text" | "manual" {
  return task.answer_kind === "full" ? "manual" : "short_text";
}

function titleFor(task: ClassifiedTask): string {
  // A drawn formula has no text to contribute, and its path is not a title.
  const plain = task.statement_text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  const firstLine = plain.split("\n").find(line => line.trim()) ?? "";
  const trimmed = firstLine.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 200) return trimmed || `Задание ФИПИ ${task.short_id}`;
  return `${trimmed.slice(0, 197)}…`;
}

async function ensureBuckets(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  trackId: number,
): Promise<void> {
  const extra = [
    [PRACTICAL_BLOCK_KIM, "Практический блок: номер уточняется", 5, "part1"],
    [GEOMETRY_PAIR_KIM, "Геометрия: вычисление, №23 или №25", 25, "part2"],
    [UNSORTED_KIM, "Требует разбора", 99, "part1"],
  ] as const;

  const present = await db
    .select({ kimNumber: examTaskTypes.kimNumber })
    .from(examTaskTypes)
    .where(eq(examTaskTypes.examTrackId, trackId));
  const known = new Set(present.map(row => row.kimNumber));

  const timestamp = Date.now();
  const missing = extra.filter(([kimNumber]) => !known.has(kimNumber));
  const description = (kimNumber: string) => {
    if (kimNumber === PRACTICAL_BLOCK_KIM) {
      return "Открытый банк ФИПИ хранит блок 1–5 расплющенным: пять вопросов лежат отдельными записями без связи между собой. Здесь остаётся то, что не удалось разложить по местам внутри группы.";
    }
    if (kimNumber === GEOMETRY_PAIR_KIM) {
      return "Задания 23 и 25 — одна и та же геометрическая задача на вычисление, различающаяся только уровнем сложности, которого банк не публикует. Номер внутри пары поставит редактор.";
    }
    return "Классификатор не смог однозначно определить номер задания. Список кандидатов виден в редакторе.";
  };

  if (missing.length) {
    await db.insert(examTaskTypes).values(
      missing.map(([kimNumber, title, sortOrder, part]) => ({
        examTrackId: trackId,
        kimNumber,
        title,
        part,
        sortOrder,
        description: description(kimNumber),
        requiresVisual: false,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
  }
}

function contentTypeFor(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "image/png";
}

/**
 * Point a text's inline formulas at our own copies.
 *
 * ФИПИ drew part of the condition instead of writing it — «Диагональ ромба
 * равна 28, а ![](…innerimg2.gif). Найдите площадь» — so the picture is a word
 * of the sentence, not an illustration beside it. The parser leaves the bank's
 * own path in the markdown; here it becomes a stored URL. A picture we do not
 * have locally is dropped rather than left as a broken image, which puts the
 * hole back but never shows the learner a missing-image icon.
 *
 * The shared text of a group needs the same pass: the tyre groups spell the
 * width and the sidewall height as pictures inside their sentence.
 */
async function inlineImages(
  markdown: string,
  inline: string[],
  guid: string,
  imagesDir: string,
): Promise<string> {
  if (!inline.length) return markdown;

  for (const relPath of Array.from(new Set(inline))) {
    const localFile = path.join(imagesDir, guid, path.basename(relPath));
    let replacement = "";
    if (fs.existsSync(localFile)) {
      const { url } = await storagePut(
        `fipi/${guid}/${path.basename(localFile)}`,
        fs.readFileSync(localFile),
        contentTypeFor(localFile),
      );
      replacement = `![](${url})`;
    } else {
      console.warn(`  ! нет формулы ${localFile}, условие останется с пропуском`);
    }
    markdown = markdown.split(`![](${relPath})`).join(replacement);
  }
  // Tidy up after a picture we could not resolve: a dropped formula otherwise
  // leaves «равна 28, а . Найдите». The `!` of `![](` is deliberately not in
  // the punctuation class — it would eat the space in front of every formula.
  return markdown.replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+([.,;:?])/g, "$1");
}

/**
 * Take a drawn-in formula out of the gallery beside the task.
 *
 * Earlier imports filed every picture the same way, so a bare «24/7» sat next
 * to the diagram explaining nothing. Now that the statement carries the formula
 * in its own sentence, that row is a duplicate.
 */
async function dropInlineVisuals(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  taskId: number,
  task: ClassifiedTask,
): Promise<number> {
  const inline = [...(task.inline_images ?? []), ...(task.group_inline_images ?? [])];
  if (!inline.length) return 0;

  const urls = inline
    .map(relPath => task.image_urls[task.images.indexOf(relPath)])
    .filter((url): url is string => Boolean(url));
  if (!urls.length) return 0;

  const stale = await db
    .select({ id: taskVisuals.id })
    .from(taskVisuals)
    .where(and(eq(taskVisuals.taskId, taskId), inArray(taskVisuals.sourceUrl, urls)));
  if (!stale.length) return 0;

  await db.delete(taskVisuals).where(inArray(taskVisuals.id, stale.map(row => row.id)));
  return stale.length;
}

async function uploadImages(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  taskId: number,
  task: ClassifiedTask,
  imagesDir: string,
): Promise<number> {
  if (!task.images.length) return 0;

  const existing = await db
    .select({ sourceUrl: taskVisuals.sourceUrl })
    .from(taskVisuals)
    .where(eq(taskVisuals.taskId, taskId));
  // Compare per image rather than per task: a later crawl can discover an
  // asset the first one missed, such as the plan shared by a whole group.
  const known = new Set(existing.map(row => row.sourceUrl).filter(Boolean));

  // A formula drawn inside the sentence is already referenced by the statement
  // itself; repeating it in the gallery shows the learner a stray «24/7».
  const inline = new Set(task.inline_images ?? []);

  let uploaded = 0;
  for (const [index, relPath] of Array.from(task.images.entries())) {
    if (inline.has(relPath)) continue;
    const remoteUrl = task.image_urls[index] ?? null;
    if (remoteUrl && known.has(remoteUrl)) continue;
    const localFile = path.join(imagesDir, task.guid, path.basename(relPath));
    if (!fs.existsSync(localFile)) {
      console.warn(`  ! нет файла ${localFile}`);
      continue;
    }
    const bytes = fs.readFileSync(localFile);

    const { url } = await storagePut(`fipi/${task.guid}/${path.basename(localFile)}`, bytes, contentTypeFor(localFile));

    const timestamp = Date.now();
    await db.insert(taskVisuals).values({
      taskId,
      kind: "image_asset",
      placement: "statement",
      assetUrl: url,
      // ФИПИ ships no alt text; this is honest about what the image is and
      // flags it for an editor rather than inventing a description.
      altText: `Схема к заданию ${task.short_id} из открытого банка ФИПИ. Описание не заполнено.`,
      sourceKind: "external",
      sourceUrl: remoteUrl,
      reviewStatus: "approved",
      sortOrder: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    uploaded += 1;
  }
  return uploaded;
}

/**
 * Store the text a group of questions shares.
 *
 * The practical block of the exam is one situation — a plan of a village, a
 * tariff table — with five questions hanging off it. ФИПИ keeps that text in a
 * separate record reachable only through the group filter, so without this the
 * questions arrive stripped of the very thing they ask about.
 */
async function upsertGroupIntro(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  taskId: number,
  task: ClassifiedTask,
  imagesDir: string,
): Promise<void> {
  if (!task.group_intro.trim()) return;

  const body = await inlineImages(
    task.group_intro,
    task.group_inline_images ?? [],
    task.guid,
    imagesDir,
  );
  const title = "Общее условие";
  const existing = await db
    .select({ id: taskAdditionalMaterials.id })
    .from(taskAdditionalMaterials)
    .where(and(eq(taskAdditionalMaterials.taskId, taskId), eq(taskAdditionalMaterials.title, title)))
    .limit(1);

  const timestamp = Date.now();
  if (existing[0]) {
    await db
      .update(taskAdditionalMaterials)
      .set({ bodyMarkdown: body, updatedAt: timestamp })
      .where(eq(taskAdditionalMaterials.id, existing[0].id));
    return;
  }
  await db.insert(taskAdditionalMaterials).values({
    taskId,
    title,
    bodyMarkdown: body,
    sortOrder: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const tasksFile = path.resolve(args.tasksFile);
  const imagesDir = path.resolve(args.imagesDir);

  // Answers confirmed against ФИПИ's own checker. Only these are trusted as
  // keys; anything unconfirmed stays empty rather than becoming a guess a
  // learner would be marked wrong against.
  const answerByGuid = new Map<string, string>();
  const answersFile = path.resolve(args.answersFile);
  if (fs.existsSync(answersFile)) {
    for (const line of fs.readFileSync(answersFile, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as { guid: string; answer: string };
      answerByGuid.set(record.guid, record.answer);
    }
    console.log(`Подтверждённых ответов: ${answerByGuid.size}`);
  }

  if (!fs.existsSync(tasksFile)) {
    console.error(`Не найден ${tasksFile}.\nСначала: cd tools/fipi && python3 run.py crawl && python3 run.py build`);
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL не задан — подключиться к базе не удалось.");
    process.exit(1);
  }

  const [subject] = await db.select().from(subjects).where(eq(subjects.slug, SUBJECT_SLUG)).limit(1);
  const [track] = await db.select().from(examTracks).where(eq(examTracks.slug, args.trackSlug)).limit(1);
  if (!subject || !track) {
    console.error("Нет предмета или маршрута ОГЭ. Запустите приложение один раз, чтобы отработали сиды.");
    process.exit(1);
  }

  // The ОГЭ bucket types (practical block, 23/25 pair) are specific to that
  // track; other banks pre-seed their own types, so skip the auto-seed there.
  if (args.trackSlug === "oge-mathematics") await ensureBuckets(db, track.id);

  const typeRows = await db
    .select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber })
    .from(examTaskTypes)
    .where(eq(examTaskTypes.examTrackId, track.id));
  const typeIdByKim = new Map(typeRows.map(row => [row.kimNumber, row.id]));

  // One query instead of one per task: the bank is ~4000 rows.
  const known = await db
    .select({ id: tasks.id, sourceRecordId: tasks.sourceRecordId })
    .from(tasks)
    .where(and(eq(tasks.examTrackId, track.id), isNotNull(tasks.sourceRecordId)));
  const idByGuid = new Map(known.map(row => [row.sourceRecordId!, row.id]));

  const [{ maxCatalog }] = await db
    .select({ maxCatalog: sql<number>`COALESCE(MAX(${tasks.catalogNumber}), 0)` })
    .from(tasks);
  let catalogNumber = Number(maxCatalog) || 0;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let images = 0;
  let detached = 0;
  const perKim = new Map<string, number>();

  for await (const task of readTasks(tasksFile, args.limit)) {
    const kimNumber = kimNumberFor(task);
    const examTaskTypeId = typeIdByKim.get(kimNumber);
    if (!examTaskTypeId) {
      console.warn(`  ! нет типа КИМ «${kimNumber}», пропускаю ${task.short_id}`);
      skipped += 1;
      continue;
    }
    perKim.set(kimNumber, (perKim.get(kimNumber) ?? 0) + 1);

    const timestamp = Date.now();
    const shared = {
      subjectId: subject.id,
      examTrackId: track.id,
      examTaskTypeId,
      title: titleFor(task),
      statementMarkdown: await inlineImages(
        task.statement_text,
        task.inline_images ?? [],
        task.guid,
        imagesDir,
      ),
      answerChoices: task.choices.length
        ? task.choices.map(choice => ({ id: choice.value, label: choice.text }))
        : null,
      answerKind: answerKindFor(task),
      sourceKind: "fipi" as const,
      sourceTitle: args.sourceTitle,
      sourceUrl: task.url,
      sourceRecordId: task.guid,
      status: args.status,
      updatedAt: timestamp,
    };

    const key = answerByGuid.get(task.guid) ?? null;
    const existingId = idByGuid.get(task.guid);
    let taskId: number;

    if (existingId) {
      // Keep slug, internalId and catalogNumber stable across re-imports —
      // and keep whatever a human has since added. A re-import refreshes what
      // came from ФИПИ; it must not undo an editor's work. The answer key is
      // only written when this run actually has one, because keys also arrive
      // through the admin, and the разбор is written once and never reset.
      await db
        .update(tasks)
        .set(key ? { ...shared, correctAnswer: key } : shared)
        .where(eq(tasks.id, existingId));
      taskId = existingId;
      updated += 1;
    } else {
      catalogNumber += 1;
      await db.insert(tasks).values({
        ...shared,
        correctAnswer: key,
        solutionMarkdown: SOLUTION_PLACEHOLDER,
        slug: `fipi-${task.short_id.toLowerCase()}`,
        internalId: `SH911-OGE-FIPI-${task.short_id.toUpperCase()}`,
        catalogNumber,
        sourceAccessedAt: timestamp,
        contentVersion: 1,
        createdAt: timestamp,
        publishedAt: args.status === "published" ? timestamp : null,
      });
      const [created] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.examTrackId, track.id), eq(tasks.sourceRecordId, task.guid)))
        .limit(1);
      if (!created) {
        console.warn(`  ! не удалось перечитать ${task.short_id}`);
        skipped += 1;
        continue;
      }
      taskId = created.id;
      inserted += 1;
    }

    await upsertGroupIntro(db, taskId, task, imagesDir);
    detached += await dropInlineVisuals(db, taskId, task);

    if (args.withImages) {
      images += await uploadImages(db, taskId, task, imagesDir);
    }

    const total = inserted + updated;
    if (total % 250 === 0) console.log(`  ${total} задач…`);
  }

  console.log(`\nДобавлено ${inserted}, обновлено ${updated}, пропущено ${skipped}`);
  if (answerByGuid.size) console.log(`С проверяемым ответом: ${answerByGuid.size}`);
  if (args.withImages) console.log(`Загружено изображений: ${images}`);
  if (detached) console.log(`Формул убрано из галереи в текст условия: ${detached}`);
  console.log(`Статус импортированных задач: ${args.status}`);

  console.log("\nПо номерам ОГЭ:");
  const ordered = Array.from(perKim.entries()).sort((a, b) => {
    const rank = (value: string) =>
      value === PRACTICAL_BLOCK_KIM
        ? 5.5
        : value === GEOMETRY_PAIR_KIM
          ? 24.5
          : value === UNSORTED_KIM
            ? 100
            : Number(value);
    return rank(a[0]) - rank(b[0]);
  });
  for (const [kimNumber, count] of ordered) {
    console.log(`  №${kimNumber.padEnd(4)} ${String(count).padStart(5)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
