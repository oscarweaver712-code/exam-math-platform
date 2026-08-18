import { PlatformHeader } from "@/components/PlatformHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, Target } from "lucide-react";
import { Link } from "wouter";

type Row = {
  kimNumber: string;
  title: string;
  part: "part1" | "part2";
  total: number;
  correct: number;
  incorrect: number;
  awaiting: number;
  untouched: number;
};

const SOLVED = "#7ad39b";
const WRONG = "#e2896b";
const WAITING = "#ff8b4b";

/** One number of the exam, as a bar the width of the whole bank behind it. */
function NumberRow({ row }: { row: Row }) {
  const share = (value: number) => `${(value / Math.max(row.total, 1)) * 100}%`;
  const done = row.part === "part1" ? row.correct : row.correct + row.awaiting;
  const percent = Math.round((done / Math.max(row.total, 1)) * 100);

  return (
    <Link
      href={`/bank?kim=${encodeURIComponent(row.kimNumber)}`}
      className="block rounded-2xl border border-white/8 bg-white/[.025] p-4 transition-colors hover:border-[#ff5b14]/45"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-3">
          <span className="font-['Space_Grotesk'] text-2xl font-bold text-[#ff5b14]">
            №&nbsp;{row.kimNumber}
          </span>
          <span className="text-sm font-bold text-[#ded9d2]">{row.title}</span>
        </div>
        <span className="theme-muted text-xs">
          {done} из {row.total}
          {percent ? ` · ${percent}%` : ""}
        </span>
      </div>

      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/8">
        <div style={{ width: share(row.correct), background: SOLVED }} />
        <div style={{ width: share(row.incorrect), background: WRONG }} />
        <div style={{ width: share(row.awaiting), background: WAITING }} />
      </div>

      {row.correct + row.incorrect + row.awaiting > 0 ? (
        <div className="theme-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {row.correct ? <span style={{ color: SOLVED }}>верно {row.correct}</span> : null}
          {row.incorrect ? <span style={{ color: WRONG }}>неверно {row.incorrect}</span> : null}
          {row.awaiting ? <span style={{ color: WAITING }}>на проверке {row.awaiting}</span> : null}
          <span>не решено {row.untouched}</span>
        </div>
      ) : (
        <p className="theme-muted mt-2 text-[11px]">ещё не начинали</p>
      )}
    </Link>
  );
}

export default function Progress() {
  const { isAuthenticated } = useAuth();
  const numbers = trpc.learning.byNumber.useQuery(undefined, { enabled: isAuthenticated });

  const rows = (numbers.data ?? []) as Row[];
  const partOne = rows.filter(row => row.part === "part1");
  const partTwo = rows.filter(row => row.part === "part2");
  const total = partOne.reduce((sum, row) => sum + row.total, 0);
  const solved = partOne.reduce((sum, row) => sum + row.correct, 0);
  const started = partOne.filter(row => row.correct + row.incorrect + row.awaiting > 0).length;
  const percent = total ? Math.round((solved / total) * 100) : 0;

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_85%_20%,rgba(255,91,20,.18),transparent_26%),linear-gradient(135deg,#151519,#101012)] p-6 sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#ff8b4b]">
            ОГЭ · математика · ваш прогресс
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-.06em] sm:text-5xl">
            Экзамен — это 25 номеров.
          </h1>
          <p className="theme-muted mt-4 max-w-xl text-sm leading-6 sm:text-base">
            Здесь видно, где вы по каждому из них: сколько задач в банке, сколько уже решено верно
            и что осталось. Номер открывается в банке одним нажатием.
          </p>
          <div className="relative mt-7 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">
                Часть 1 решена верно
              </p>
              <p className="mt-1">
                <strong className="font-['Space_Grotesk'] text-3xl text-[#ff5b14]">{solved}</strong>
                <span className="theme-muted text-sm"> из {total} · {percent}%</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">
                Номеров начато
              </p>
              <p className="mt-1">
                <strong className="font-['Space_Grotesk'] text-3xl text-[#ff5b14]">{started}</strong>
                <span className="theme-muted text-sm"> из {partOne.length}</span>
              </p>
            </div>
          </div>
        </section>

        {numbers.isLoading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff5b14]" />
          </div>
        ) : (
          <>
            <section className="mt-7">
              <h2 className="flex items-center gap-2 text-sm font-extrabold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/7 text-[#ff8b4b]">
                  <Target className="h-4 w-4" />
                </span>
                Часть 1 — ответ проверяется сразу
              </h2>
              <div className="mt-4 space-y-2">
                {partOne.map(row => (
                  <NumberRow key={row.kimNumber} row={row} />
                ))}
              </div>
            </section>

            {partTwo.length ? (
              <section className="mt-8">
                <h2 className="text-sm font-extrabold">Часть 2 — решение с записью</h2>
                <p className="theme-muted mt-1 text-xs">
                  Эти задания проверяет преподаватель: автоматической проверки для развёрнутого
                  ответа не бывает.
                </p>
                <div className="mt-4 space-y-2">
                  {partTwo.map(row => (
                    <NumberRow key={row.kimNumber} row={row} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        <section className="mt-8 rounded-2xl border border-[#ff5b14]/30 bg-[#ff5b14]/7 p-5 sm:p-6">
          <b>Дальше — практика</b>
          <p className="theme-muted mt-2 max-w-xl text-sm leading-6">
            Выберите номер, который просел сильнее всего, и решайте подряд: банк отдаёт задания
            одного номера списком.
          </p>
          <Link href="/bank">
            <Button className="mt-4 rounded-xl bg-[#ff5b14] font-bold text-[#101014] hover:bg-[#ff7a35]">
              Открыть банк <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
