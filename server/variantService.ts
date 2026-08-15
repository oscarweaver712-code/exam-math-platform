import { and, asc, eq } from "drizzle-orm";
import { examTaskTypes, examVariantItems, examVariants, tasks } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function indexFor(key: string, length: number) {
  let value = 0;
  for (const char of key) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value % length;
}

export function monthKeyFrom(timestamp = Date.now()) { return new Date(timestamp).toISOString().slice(0, 7); }

export async function createPublishedMonthlyVariant(db: Db, examTrackId: number, monthKey: string) {
  const [existing] = await db.select({ id: examVariants.id, slug: examVariants.slug }).from(examVariants).where(and(eq(examVariants.examTrackId, examTrackId), eq(examVariants.monthKey, monthKey))).limit(1);
  if (existing) return { variantId: existing.id, slug: existing.slug, created: false };
  const candidates = await db.select({ id: tasks.id, contentVersion: tasks.contentVersion, kimNumber: examTaskTypes.kimNumber }).from(tasks).innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id)).where(and(eq(tasks.examTrackId, examTrackId), eq(tasks.status, "published"), eq(tasks.sourceKind, "author"))).orderBy(asc(examTaskTypes.sortOrder), asc(tasks.id));
  const byKim = new Map<string, Array<(typeof candidates)[number]>>();
  for (const item of candidates) byKim.set(item.kimNumber, [...(byKim.get(item.kimNumber) ?? []), item]);
  const selected = Array.from({ length: 25 }, (_, index) => {
    const kimNumber = String(index + 1); const pool = byKim.get(kimNumber) ?? [];
    if (!pool.length) throw new Error(`Недостаточно опубликованных авторских задач для КИМ № ${kimNumber}.`);
    return pool[indexFor(`${monthKey}:${kimNumber}`, pool.length)];
  });
  const timestamp = Date.now(); const slug = `oge-mathematics-${monthKey}`;
  const inserted = await db.insert(examVariants).values({ examTrackId, slug, title: `Вариант ОГЭ по математике · ${monthKey}`, origin: "monthly", monthKey, status: "published", generatedAt: timestamp, publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
  const variantId = Number(inserted[0].insertId);
  await db.insert(examVariantItems).values(selected.map((task, index) => ({ examVariantId: variantId, taskId: task.id, taskContentVersion: task.contentVersion, sortOrder: index + 1, createdAt: timestamp })));
  return { variantId, slug, created: true };
}

export async function buildEphemeralVariant(db: Db, examTrackId: number, entropy: string) {
  const candidates = await db.select({ id: tasks.id, slug: tasks.slug, title: tasks.title, statementMarkdown: tasks.statementMarkdown, answerKind: tasks.answerKind, kimNumber: examTaskTypes.kimNumber, part: examTaskTypes.part }).from(tasks).innerJoin(examTaskTypes, eq(tasks.examTaskTypeId, examTaskTypes.id)).where(and(eq(tasks.examTrackId, examTrackId), eq(tasks.status, "published"), eq(tasks.sourceKind, "author"))).orderBy(asc(examTaskTypes.sortOrder), asc(tasks.id));
  const byKim = new Map<string, Array<(typeof candidates)[number]>>(); for (const item of candidates) byKim.set(item.kimNumber, [...(byKim.get(item.kimNumber) ?? []), item]);
  return Array.from({ length: 25 }, (_, index) => { const kim = String(index + 1); const pool = byKim.get(kim) ?? []; if (!pool.length) throw new Error(`Нет задачи для КИМ № ${kim}.`); return { ...pool[indexFor(`${entropy}:${kim}`, pool.length)], sortOrder: index + 1 }; });
}
