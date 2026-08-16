/**
 * Dumps the bank to JSONL so it survives the loss of the database.
 *
 *   pnpm export:bank                      # everything, to backup/
 *   pnpm export:bank -- --out /data/backup
 *   pnpm export:bank -- --answers-only    # just the keys, for the repo
 *
 * The scraped ФИПИ statements can always be rebuilt by re-running the crawler,
 * but two things cannot: the confirmed answer keys, which cost one request to
 * ФИПИ each, and the solutions editors write by hand. Those are what this
 * protects.
 */

import fs from "node:fs";
import path from "node:path";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import {
  examTaskTypes,
  taskAdditionalMaterials,
  taskSolutionSteps,
  taskVisuals,
  tasks,
} from "../drizzle/schema";
import { getDb } from "./db";

type Args = { outDir: string; answersOnly: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { outDir: "backup", answersOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.outDir = argv[++i];
    else if (argv[i] === "--answers-only") args.answersOnly = true;
  }
  return args;
}

function writeJsonl(file: string, rows: unknown[]): void {
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf-8");
  console.log(`  ${path.basename(file)}: ${rows.length}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL не задан.");
    process.exit(1);
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  console.log(`Выгрузка в ${path.resolve(args.outDir)}`);

  // Keys, in the same shape the importer reads back with --answers.
  const keys = await db
    .select({ guid: tasks.sourceRecordId, short_id: tasks.internalId, answer: tasks.correctAnswer })
    .from(tasks)
    .where(and(isNotNull(tasks.sourceRecordId), isNotNull(tasks.correctAnswer), ne(tasks.correctAnswer, "")));
  writeJsonl(
    path.join(args.outDir, "answers.jsonl"),
    keys.map(row => ({
      guid: row.guid,
      short_id: (row.short_id ?? "").replace(/^SH911-OGE-FIPI-/, ""),
      answer: row.answer,
    })),
  );

  if (args.answersOnly) return;

  // Editorial work: solutions, steps and extra conditions written by hand.
  const written = await db
    .select({
      internalId: tasks.internalId,
      sourceRecordId: tasks.sourceRecordId,
      slug: tasks.slug,
      kimNumber: examTaskTypes.kimNumber,
      title: tasks.title,
      solutionMarkdown: tasks.solutionMarkdown,
      status: tasks.status,
    })
    .from(tasks)
    .innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id));
  writeJsonl(path.join(args.outDir, "tasks.jsonl"), written);

  writeJsonl(path.join(args.outDir, "solution-steps.jsonl"), await db.select().from(taskSolutionSteps));
  writeJsonl(path.join(args.outDir, "materials.jsonl"), await db.select().from(taskAdditionalMaterials));
  writeJsonl(path.join(args.outDir, "visuals.jsonl"), await db.select().from(taskVisuals));

  console.log("Готово. Изображения лежат в хранилище отдельно и в выгрузку не входят.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
