export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * What a task's разбор says before anyone writes one.
 *
 * The ФИПИ bank publishes no worked solutions, so an imported task arrives
 * with this in place of one. The importer writes it and the editor's queue
 * looks for it, which is why it lives here rather than in either of them.
 */
export const SOLUTION_PLACEHOLDER =
  "_Разбор ещё не написан._\n\nЗадание импортировано из открытого банка ФИПИ, который не публикует решения. Добавьте разбор через редактор.";

/** Whether a разбор is still the placeholder rather than a written one. */
export function isSolutionMissing(markdown: string | null | undefined): boolean {
  return !markdown?.trim() || markdown.trimStart().startsWith("_Разбор ещё не написан._");
}
