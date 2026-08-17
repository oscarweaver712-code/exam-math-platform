/**
 * Moves already-imported ФИПИ tasks into the КИМ bucket the classifier now
 * gives them, without touching anything else about them.
 *
 *   node tools/db/apply-numbers.mjs [--tasks path/to/tasks.jsonl] [--dry-run]
 *
 * A full `import:fipi` would do the same thing along the way, but it rewrites
 * every statement and re-uploads every picture to change one column. Here only
 * `examTaskTypeId` moves, matched on the ФИПИ GUID in `sourceRecordId`, so a
 * re-classification costs one pass over 3884 rows and can be read before it is
 * applied.
 *
 * On Railway the script runs off the mounted volume, where `/data` and `/app`
 * are separate trees and a bare `mysql2` import does not resolve; both spellings
 * are tried. Column names in this database are camelCase.
 *
 *   railway volume files --volume school-911-volume upload --overwrite \
 *     tools/db/apply-numbers.mjs /import/apply-numbers.mjs
 *   railway ssh -- node /data/import/apply-numbers.mjs --tasks /data/import/out/tasks.jsonl
 */

import fs from "node:fs";
import readline from "node:readline";

const TRACK_SLUG = "oge-mathematics";
const PRACTICAL_BLOCK_KIM = "1–5";
const GEOMETRY_PAIR_KIM = "23/25";
const UNSORTED_KIM = "0";

/** Buckets the ФИПИ importer owns, in case this script runs before it does. */
const EXTRA_BUCKETS = [
  {
    kimNumber: PRACTICAL_BLOCK_KIM,
    title: "Практический блок: номер уточняется",
    part: "part1",
    sortOrder: 5,
    description:
      "Открытый банк ФИПИ хранит блок 1–5 расплющенным: пять вопросов лежат отдельными записями без связи между собой. Здесь остаётся то, что не удалось разложить по местам внутри группы.",
  },
  {
    kimNumber: GEOMETRY_PAIR_KIM,
    title: "Геометрия: вычисление, №23 или №25",
    part: "part2",
    sortOrder: 25,
    description:
      "Задания 23 и 25 — одна и та же геометрическая задача на вычисление, различающаяся только уровнем сложности, которого банк не публикует. Номер внутри пары поставит редактор.",
  },
  {
    kimNumber: UNSORTED_KIM,
    title: "Требует разбора",
    part: "part1",
    sortOrder: 99,
    description:
      "Классификатор не смог однозначно определить номер задания. Список кандидатов виден в редакторе.",
  },
];

function parseArgs(argv) {
  const args = { tasksFile: "tools/fipi/out/tasks.jsonl", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tasks") args.tasksFile = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function loadMysql() {
  for (const specifier of ["mysql2/promise", "/app/node_modules/mysql2/promise.js"]) {
    try {
      return (await import(specifier)).default;
    } catch {
      // try the next spelling
    }
  }
  throw new Error("mysql2 не найден ни как модуль, ни в /app/node_modules");
}

/** Same rule as `server/importFipi.ts`: a number, a pair, or the unsorted bin. */
function kimNumberFor(task) {
  if (task.oge_number !== null && task.oge_number !== undefined) return String(task.oge_number);
  const candidates = task.classification?.candidates ?? [];
  if (candidates.length === 5 && candidates.every((n, i) => n === i + 1)) return PRACTICAL_BLOCK_KIM;
  if (candidates.length === 2 && candidates[0] === 23 && candidates[1] === 25) return GEOMETRY_PAIR_KIM;
  return UNSORTED_KIM;
}

async function readWanted(tasksFile) {
  const wanted = new Map();
  const stream = readline.createInterface({
    input: fs.createReadStream(tasksFile, "utf-8"),
    crlfDelay: Infinity,
  });
  for await (const line of stream) {
    if (!line.trim()) continue;
    const task = JSON.parse(line);
    wanted.set(task.guid, kimNumberFor(task));
  }
  stream.close();
  return wanted;
}

function rank(kimNumber) {
  if (kimNumber === PRACTICAL_BLOCK_KIM) return 5.5;
  if (kimNumber === GEOMETRY_PAIR_KIM) return 24.5;
  if (kimNumber === UNSORTED_KIM) return 100;
  return Number(kimNumber);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL не задан.");
    process.exit(1);
  }
  if (!fs.existsSync(args.tasksFile)) {
    console.error(`Нет файла ${args.tasksFile}`);
    process.exit(1);
  }

  const mysql = await loadMysql();
  const wanted = await readWanted(args.tasksFile);
  console.log(`${wanted.size} задач в ${args.tasksFile}`);

  const db = await mysql.createConnection(process.env.DATABASE_URL);
  const [[track]] = await db.query("SELECT id FROM exam_tracks WHERE slug = ? LIMIT 1", [TRACK_SLUG]);
  if (!track) {
    console.error("Маршрут ОГЭ не найден.");
    process.exit(1);
  }

  const [typeRows] = await db.query(
    "SELECT id, kimNumber FROM exam_task_types WHERE examTrackId = ?",
    [track.id],
  );
  const typeIdByKim = new Map(typeRows.map(row => [row.kimNumber, row.id]));

  const now = Date.now();
  for (const bucket of EXTRA_BUCKETS) {
    if (typeIdByKim.has(bucket.kimNumber)) continue;
    const [result] = await db.query(
      `INSERT INTO exam_task_types
         (examTrackId, kimNumber, title, part, sortOrder, description, requiresVisual, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      [track.id, bucket.kimNumber, bucket.title, bucket.part, bucket.sortOrder, bucket.description, now, now],
    );
    typeIdByKim.set(bucket.kimNumber, result.insertId);
    console.log(`создана корзина «${bucket.kimNumber}» (${bucket.title})`);
  }

  const [taskRows] = await db.query(
    `SELECT t.id, t.sourceRecordId, e.kimNumber
       FROM tasks t
       JOIN exam_task_types e ON e.id = t.examTaskTypeId
      WHERE t.examTrackId = ? AND t.sourceRecordId IS NOT NULL`,
    [track.id],
  );
  console.log(`${taskRows.length} задач ФИПИ в базе`);

  const moves = new Map(); // целевая корзина -> [id]
  const from = new Map();
  let unknownBucket = 0;
  let missing = 0;
  for (const row of taskRows) {
    const target = wanted.get(row.sourceRecordId);
    if (!target) {
      missing += 1;
      continue;
    }
    if (target === row.kimNumber) continue;
    const typeId = typeIdByKim.get(target);
    if (!typeId) {
      unknownBucket += 1;
      continue;
    }
    if (!moves.has(target)) moves.set(target, []);
    moves.get(target).push(row.id);
    from.set(`${row.kimNumber} → ${target}`, (from.get(`${row.kimNumber} → ${target}`) ?? 0) + 1);
  }

  const total = Array.from(moves.values()).reduce((sum, ids) => sum + ids.length, 0);
  console.log(`\nПереставить: ${total}`);
  for (const [move, count] of Array.from(from.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${move.padEnd(16)} ${count}`);
  }
  if (missing) console.log(`Нет в файле классификации: ${missing}`);
  if (unknownBucket) console.log(`! неизвестная корзина: ${unknownBucket}`);

  if (args.dryRun) {
    console.log("\n--dry-run: база не тронута");
  } else {
    for (const [kimNumber, ids] of moves) {
      const typeId = typeIdByKim.get(kimNumber);
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await db.query(
          `UPDATE tasks SET examTaskTypeId = ?, updatedAt = ? WHERE id IN (${chunk.map(() => "?").join(",")})`,
          [typeId, Date.now(), ...chunk],
        );
      }
    }
    console.log("\nГотово.");
  }

  const [after] = await db.query(
    `SELECT e.kimNumber, e.part, COUNT(t.id) AS total
       FROM exam_task_types e
       LEFT JOIN tasks t
         ON t.examTaskTypeId = e.id AND t.status = 'published' AND t.deletedAt IS NULL
      WHERE e.examTrackId = ?
      GROUP BY e.id
      ORDER BY e.sortOrder`,
    [track.id],
  );
  console.log("\nПо номерам ОГЭ (опубликованные):");
  let published = 0;
  for (const row of after.sort((a, b) => rank(a.kimNumber) - rank(b.kimNumber))) {
    published += Number(row.total);
    console.log(`  №${String(row.kimNumber).padEnd(5)} ${String(row.total).padStart(5)}  ${row.part}`);
  }
  console.log(`  всего ${published}`);

  await db.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
