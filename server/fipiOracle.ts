/**
 * Answer checking against the ФИПИ open bank.
 *
 * ФИПИ publishes tasks but not answer keys, so an imported task arrives with
 * `correctAnswer` empty. The bank's own site checks answers through
 * `solve.php`, and we use the same endpoint: the student types an answer, we
 * ask ФИПИ, and the verdict comes back the way it would on their site.
 *
 * The first confirmed answer is written back to `tasks.correctAnswer`, so each
 * task costs at most a handful of round trips over its lifetime and the bank
 * gradually becomes self-sufficient. That is the point — the dependency is a
 * bootstrap, not a permanent one.
 *
 * This is deliberately one request per answer a human typed. It is not a way
 * to discover keys by enumeration: that would not work for anything but short
 * numeric answers, and the traffic would look like an attack on a single
 * public host.
 */

const SOLVE_URL = "https://oge.fipi.ru/bank/solve.php";
const QUESTIONS_URL = "https://oge.fipi.ru/bank/questions.php";

/** Subject project «Математика» inside the ОГЭ bank. */
export const MATH_PROJ = "DE0E276E497AB3784C3FC4CC20248DC0";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TIMEOUT_MS = 12_000;

export type OracleVerdict =
  /** ФИПИ accepted the answer. */
  | { status: "correct" }
  /** ФИПИ rejected it. */
  | { status: "incorrect" }
  /** ФИПИ was unreachable or answered something we do not recognise. */
  | { status: "unavailable"; reason: string };

function buildBody(guid: string, answer: string, boundary: string): string {
  const fields: Array<[string, string]> = [
    ["guid", guid],
    ["answer", answer],
    ["ajax", "1"],
    ["proj", MATH_PROJ],
    ["chkcode", ""],
  ];
  return (
    fields
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      )
      .join("") + `--${boundary}--\r\n`
  );
}

/**
 * Ask ФИПИ whether `answer` is right for the question identified by `guid`.
 *
 * Never throws: an unreachable bank must degrade to «ответ сохранён», not to a
 * failed submission that loses the student's work.
 */
export async function checkAnswerWithFipi(guid: string, answer: string): Promise<OracleVerdict> {
  const boundary = "----school911-oracle-boundary";

  try {
    const response = await fetch(SOLVE_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Referer: QUESTIONS_URL,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: buildBody(guid, answer, boundary),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { status: "unavailable", reason: `HTTP ${response.status}` };
    }

    // The endpoint answers with a single digit and nothing else.
    // `1` and `3` both mean the answer was accepted; `2` means it was not.
    const verdict = (await response.text()).trim();
    if (verdict === "1" || verdict === "3") return { status: "correct" };
    if (verdict === "2") return { status: "incorrect" };
    return { status: "unavailable", reason: `неожиданный ответ «${verdict.slice(0, 16)}»` };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
