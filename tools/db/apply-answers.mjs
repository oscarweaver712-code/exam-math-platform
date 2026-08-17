/**
 * Writes confirmed answer keys into the bank, touching nothing else.
 *
 *   node tools/db/apply-answers.mjs [path/to/answers.jsonl]
 *
 * A full `import:fipi` is the wrong tool here: it rewrites the whole task, and
 * some разборы are written by hand. Between two key batches the statements and
 * the pictures have not changed — only the keys have — so exactly one column is
 * updated, matched on the ФИПИ GUID in `sourceRecordId`.
 *
 * Every key in the file has already been confirmed by ФИПИ's own checker, so
 * this script does not judge them; it reports what moved and what it could not
 * find. Column names in this database are camelCase.
 *
 *   railway volume files --volume school-911-volume upload --overwrite \
 *     tools/db/apply-answers.mjs /import/apply-answers.mjs
 *   railway ssh -- node /data/import/apply-answers.mjs /data/import/out/answers.jsonl
 */

import fs from "node:fs";

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

async function main() {
  const file = process.argv[2] ?? "tools/fipi/out/answers.jsonl";
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL не задан.");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`Нет файла ${file}`);
    process.exit(1);
  }

  const rows = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  console.log(`подтверждённых ответов в файле: ${rows.length}`);

  const mysql = await loadMysql();
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  const [[before]] = await db.query(
    "SELECT COUNT(*) n FROM tasks WHERE correctAnswer IS NOT NULL AND correctAnswer <> ''",
  );

  let changed = 0;
  let missing = 0;
  for (const row of rows) {
    const [result] = await db.execute(
      "UPDATE tasks SET correctAnswer = ?, updatedAt = ? WHERE sourceRecordId = ? AND (correctAnswer IS NULL OR correctAnswer <> ?)",
      [row.answer, Date.now(), row.guid, row.answer],
    );
    if (result.affectedRows) {
      changed += 1;
      continue;
    }
    const [[hit]] = await db.query("SELECT COUNT(*) n FROM tasks WHERE sourceRecordId = ?", [row.guid]);
    if (!hit.n) missing += 1;
  }

  const [[after]] = await db.query(
    "SELECT COUNT(*) n FROM tasks WHERE correctAnswer IS NOT NULL AND correctAnswer <> ''",
  );
  const [[written]] = await db.query(
    "SELECT COUNT(*) n FROM tasks WHERE solutionMarkdown NOT LIKE '_Разбор ещё не написан._%'",
  );
  console.log(`было ${before.n} ключей, стало ${after.n}; обновлено записей: ${changed}`);
  if (missing) console.log(`нет такой задачи в базе: ${missing}`);
  console.log(`разборов, написанных руками (не тронуты): ${written.n}`);
  await db.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
