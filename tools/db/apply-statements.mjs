/**
 * Puts the pictures drawn inside a sentence back into the statement.
 *
 *   node tools/db/apply-statements.mjs [--tasks path/to/tasks.jsonl] [--dry-run]
 *
 * ФИПИ draws part of some conditions instead of writing them, and until the
 * parser learned to recognise all three shapes of that, 137 statements and 11
 * shared texts were stored with a hole: «На прямой отмечены числа и .».
 *
 * A full `import:fipi` would fix them and rewrite everything else on the way —
 * every condition, every picture, every разбор an editor has touched. Nothing
 * else changed, so this writes exactly what did: the statement, the shared text
 * of a group, and the gallery rows those pictures no longer belong in.
 *
 * The pictures themselves are already in storage, and the URL comes from one of
 * two places. A picture only now recognised as part of the sentence arrived
 * with the first import as an ordinary diagram, so its gallery row holds the
 * URL. A picture that was recognised earlier never got a gallery row — the
 * importer skips those — but the statement in the database already points at
 * it, so the URL is read back out of the text by the file name. Storage adds a
 * hash to that name, which is why neither URL can simply be computed.
 *
 * A picture neither place can account for is left out of the sentence rather
 * than written as a bank-relative path the browser cannot resolve — that keeps
 * the hole but never shows a broken image.
 *
 * Column names in this database are camelCase.
 *
 *   railway volume files --volume school-911-volume upload --overwrite \
 *     tools/db/apply-statements.mjs /import/apply-statements.mjs
 *   railway volume files --volume school-911-volume upload --overwrite \
 *     tools/fipi/out/tasks.jsonl /import/out/tasks.jsonl
 *   railway ssh -- node /data/import/apply-statements.mjs \
 *     --tasks /data/import/out/tasks.jsonl --dry-run
 */

import fs from "node:fs";

const HOST = "https://oge.fipi.ru";
const INTRO_TITLE = "Общее условие";

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

function parseArgs(argv) {
  const args = { tasks: "tools/fipi/out/tasks.jsonl", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--tasks") args.tasks = argv[i + 1];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

const MEDIA_RE = /!\[\]\((\/media\/[^)\s]+)\)/g;

/**
 * URLs already written into a text, indexed by the bank's own file name.
 *
 * Storage appends a hash — `innerimg0.gif` is stored as
 * `innerimg0_90a5ed85.gif` — so the stem and the extension are what match.
 */
function urlsInText(markdown) {
  const found = new Map();
  for (const [, url] of markdown.matchAll(MEDIA_RE)) {
    const name = url.split("/").pop() ?? "";
    const dot = name.lastIndexOf(".");
    if (dot <= 0) continue;
    const stem = name.slice(0, dot).replace(/_[0-9a-f]{6,}$/, "");
    found.set(`${stem}${name.slice(dot)}`, url);
  }
  return found;
}

/**
 * Swap every bank path in a text for the URL of our own copy.
 *
 * Returns null when the text needs no change, so an untouched row is never
 * written and `updatedAt` keeps meaning something.
 */
function resolve(markdown, paths, urlFor, unresolved) {
  let text = markdown;
  for (const relPath of new Set(paths)) {
    const url = urlFor(relPath);
    if (!url) unresolved.add(relPath);
    text = text.split(`![](${relPath})`).join(url ? `![](${url})` : "");
  }
  // Tidy up after a picture we could not resolve: a dropped formula otherwise
  // leaves «равна 28, а . Найдите». The `!` of `![](` stays out of the
  // punctuation class — it would eat the space in front of every formula.
  text = text.replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+([.,;:?])/g, "$1");
  return text === markdown ? null : text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL не задан.");
    process.exit(1);
  }
  if (!fs.existsSync(args.tasks)) {
    console.error(`Нет файла ${args.tasks}`);
    process.exit(1);
  }

  const tasks = fs
    .readFileSync(args.tasks, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(task => (task.inline_images ?? []).length || (task.group_inline_images ?? []).length);
  console.log(`задач с картинкой внутри условия: ${tasks.length}`);

  const mysql = await loadMysql();
  const db = await mysql.createConnection(process.env.DATABASE_URL);

  let statements = 0;
  let intros = 0;
  let dropped = 0;
  let absent = 0;
  const unresolved = new Set();

  for (const task of tasks) {
    const [[row]] = await db.query(
      "SELECT id, statementMarkdown FROM tasks WHERE sourceRecordId = ? LIMIT 1",
      [task.guid],
    );
    if (!row) {
      absent += 1;
      continue;
    }

    const [visuals] = await db.query(
      "SELECT id, sourceUrl, assetUrl FROM task_visuals WHERE taskId = ?",
      [row.id],
    );
    const bySource = new Map(visuals.filter(v => v.sourceUrl).map(v => [v.sourceUrl, v]));
    const alreadyPlaced = urlsInText(row.statementMarkdown ?? "");
    const urlFor = relPath =>
      bySource.get(`${HOST}/${relPath}`)?.assetUrl ??
      alreadyPlaced.get(relPath.split("/").pop() ?? "") ??
      null;

    const statement = resolve(task.statement_text, task.inline_images ?? [], urlFor, unresolved);
    if (statement && statement !== row.statementMarkdown) {
      if (!args.dryRun) {
        await db.execute("UPDATE tasks SET statementMarkdown = ?, updatedAt = ? WHERE id = ?", [
          statement,
          Date.now(),
          row.id,
        ]);
      }
      statements += 1;
    }

    if ((task.group_inline_images ?? []).length && task.group_intro) {
      const [[material]] = await db.query(
        "SELECT id, bodyMarkdown FROM task_additional_materials WHERE taskId = ? AND title = ? LIMIT 1",
        [row.id, INTRO_TITLE],
      );
      const placedInIntro = urlsInText(material?.bodyMarkdown ?? "");
      const introUrlFor = relPath =>
        bySource.get(`${HOST}/${relPath}`)?.assetUrl ??
        placedInIntro.get(relPath.split("/").pop() ?? "") ??
        null;
      const intro = resolve(task.group_intro, task.group_inline_images, introUrlFor, unresolved);
      if (intro && material && material.bodyMarkdown !== intro) {
        if (!args.dryRun) {
          await db.execute(
            "UPDATE task_additional_materials SET bodyMarkdown = ?, updatedAt = ? WHERE id = ?",
            [intro, Date.now(), material.id],
          );
        }
        intros += 1;
      }
    }

    // A formula now written into the sentence must not also hang beside the
    // task as a stray «24/7» in the gallery.
    const inline = [...(task.inline_images ?? []), ...(task.group_inline_images ?? [])];
    const stale = inline.map(relPath => bySource.get(`${HOST}/${relPath}`)?.id).filter(Boolean);
    if (stale.length) {
      if (!args.dryRun) {
        await db.execute(
          `DELETE FROM task_visuals WHERE id IN (${stale.map(() => "?").join(",")})`,
          stale,
        );
      }
      dropped += stale.length;
    }
  }

  console.log(
    `${args.dryRun ? "показано (ничего не записано)" : "записано"}: ` +
      `условий ${statements}, общих текстов ${intros}, убрано из галереи ${dropped}`,
  );
  if (absent) console.log(`нет такой задачи в базе: ${absent}`);
  if (unresolved.size) {
    console.log(`нет нашей копии картинки: ${unresolved.size} — условие останется с пропуском`);
    for (const relPath of [...unresolved].slice(0, 5)) console.log(`  ${relPath}`);
  }
  await db.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
