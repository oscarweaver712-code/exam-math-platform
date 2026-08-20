/**
 * Seeds exam_task_types for the ЕГЭ base-math track (ege-mathematics).
 *
 * All 21 positions of the base-level plan (so an editor can assign any number
 * in the sorting admin) plus one «unsorted» type — the classifier only names a
 * number when it is confident, and the rest wait here to be sorted by hand,
 * the same way ОГЭ keeps its unresolved tasks in a bucket. Additive and
 * idempotent: existing types are left alone, matched on kimNumber.
 *
 *   railway volume files --volume school-911-volume upload --overwrite \
 *     tools/db/seed-ege-base-types.mjs /import/seed-ege-base-types.mjs
 *   railway ssh -- node /data/import/seed-ege-base-types.mjs
 */
async function loadMysql() {
  for (const s of ["mysql2/promise", "/app/node_modules/mysql2/promise.js"]) {
    try { return (await import(s)).default; } catch {}
  }
  throw new Error("mysql2 не найден");
}

// Titles condensed from the 2026 base-level specification (research/fipi-ege-2026).
const POSITIONS = [
  [1, "Вычисления и преобразования"],
  [2, "Величины и оценка размеров"],
  [3, "Таблицы, диаграммы, графики"],
  [4, "Вычисления и текстовая задача"],
  [5, "Вероятность"],
  [6, "Чтение графиков и диаграмм"],
  [7, "Функция и производная по графику"],
  [8, "Выбор верных утверждений"],
  [9, "Планиметрия: размеры и величины"],
  [10, "Планиметрия"],
  [11, "Стереометрия"],
  [12, "Планиметрия: вычисление"],
  [13, "Стереометрия: вычисление"],
  [14, "Вычисления и преобразования"],
  [15, "Вычисления и текстовая задача"],
  [16, "Вычисления и преобразования"],
  [17, "Уравнения"],
  [18, "Вычисления и неравенства"],
  [19, "Числа и их свойства"],
  [20, "Текстовая задача с уравнением"],
  [21, "Задача на смекалку"],
];

// Named buckets for families the open bank can't split into an exact number —
// several base positions share one template («Найдите значение выражения» is
// tasks 1, 14 and 16). Like ОГЭ's 23/25 pair, they live under an honest joint
// label instead of a number nobody (classifier or editor) can assign.
const BUCKETS = [
  ["1/2", "Практическая арифметика (№ 1/2)", 1],
  ["1/14/16", "Вычисления (№ 1/14/16)", 14],
  ["4/20/21", "Текстовые задачи (№ 4/20/21)", 20],
  ["9/10/12", "Планиметрия (№ 9/10/12)", 10],
  ["11/13", "Стереометрия (№ 11/13)", 12],
];

async function main() {
  const mysql = await loadMysql();
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  const [[track]] = await db.query("SELECT id FROM exam_tracks WHERE slug='ege-mathematics'");
  if (!track) { console.error("Нет трека ege-mathematics — сначала сиды приложения."); process.exit(1); }

  const [existing] = await db.query("SELECT kimNumber FROM exam_task_types WHERE examTrackId=?", [track.id]);
  const known = new Set(existing.map(r => r.kimNumber));
  const now = Date.now();

  const rows = [];
  for (const [n, title] of POSITIONS) {
    if (known.has(String(n))) continue;
    rows.push([track.id, String(n), title, "part1", n, `ЕГЭ базовый, задание № ${n}.`, now]);
  }
  for (const [kimNumber, title, sortOrder] of BUCKETS) {
    if (known.has(kimNumber)) continue;
    rows.push([track.id, kimNumber, title, "part1", sortOrder,
      "Открытый банк ФИПИ не хранит номер задания: несколько позиций базового используют одну формулировку. Как пара 23/25 в ОГЭ, они собраны под честной меткой.", now]);
  }
  if (!known.has("unsorted")) {
    rows.push([track.id, "unsorted", "Неотсортировано — номер уточняется", "part1", 99,
      "Классификатор не поставил номер уверенно; редактор присвоит его в админке сортировки.", now]);
  }

  if (rows.length) {
    await db.query(
      "INSERT INTO exam_task_types (examTrackId, kimNumber, title, part, sortOrder, description, requiresVisual, isActive, createdAt, updatedAt) VALUES " +
        rows.map(() => "(?,?,?,?,?,?,0,1,?,?)").join(","),
      rows.flatMap(r => [...r, r[6]]),
    );
  }
  console.log(`добавлено типов: ${rows.length}, было: ${known.size}`);
  await db.end();
}
main().catch(e => { console.error(e); process.exit(1); });
