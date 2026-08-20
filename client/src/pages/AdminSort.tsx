import { MathMarkdown } from "@/components/MathMarkdown";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TaskVisuals } from "@/components/TaskVisuals";
import { trpc } from "@/lib/trpc";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const panel = "theme-surface rounded-2xl border p-5 sm:p-6";

/** A line to recognise a task by in the queue, statement over stored title. */
function excerpt(statement: string): string {
  return statement
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/[*_`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export default function AdminSort() {
  const [trackSlug, setTrackSlug] = useState<string>("ege-mathematics");
  const [bucket, setBucket] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string>("");

  const tracks = trpc.catalog.examTracks.useQuery({ subjectSlug: "mathematics" });
  const queue = trpc.school.admin.sortQueue.useQuery({ trackSlug, kimNumber: bucket, page, pageSize: 20 });
  const detail = trpc.publicBank.getTask.useQuery({ slug: slug ?? "" }, { enabled: !!slug });
  const utils = trpc.useUtils();

  const save = trpc.school.admin.assignNumber.useMutation({
    onSuccess: async () => {
      toast.success("Номер присвоен");
      await utils.school.admin.sortQueue.invalidate();
      const remaining = (queue.data?.items ?? []).filter(item => item.taskId !== taskId);
      const next = remaining[0];
      setTaskId(next?.taskId ?? null);
      setSlug(next?.slug ?? null);
      setChosen("");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    setChosen("");
  }, [taskId]);

  const current = queue.data?.items.find(item => item.taskId === taskId);

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <section className={panel}>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Редакция</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.05em]">Сортировка по номерам</h1>
          <p className="theme-muted mt-3 max-w-2xl text-sm leading-6">
            Открытый банк ФИПИ не хранит номер задания. Классификатор поставил номер там, где
            уверен; остальное ждёт здесь — «неотсортировано» и совместные корзины (несколько
            позиций с одной формулировкой). Присвойте задаче конкретный номер — форма меняет
            только его.
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="text-xs font-bold text-[#b7b3ba]">
              Экзамен
              <select
                value={trackSlug}
                onChange={event => {
                  setTrackSlug(event.target.value);
                  setBucket(undefined);
                  setPage(1);
                  setTaskId(null);
                  setSlug(null);
                }}
                className="mt-1 block h-10 rounded-lg border border-white/12 bg-[#121215] px-2 text-sm font-bold text-[#ece6de]"
              >
                {(tracks.data ?? []).map(t => (
                  <option key={t.slug} value={t.slug}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {queue.data ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Ждут номера</p>
                <p className="mt-1">
                  <strong className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">{queue.data.waiting}</strong>
                  <span className="theme-muted text-sm"> задач</span>
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className={panel}>
            <label className="text-xs font-bold text-[#b7b3ba]">
              Корзина
              <select
                value={bucket ?? ""}
                onChange={event => {
                  setBucket(event.target.value || undefined);
                  setPage(1);
                }}
                className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#121215] px-2 text-sm font-bold text-[#ece6de]"
              >
                <option value="">Все неотсортированные</option>
                {queue.data?.buckets.map(b => (
                  <option key={b.kimNumber} value={b.kimNumber}>
                    {b.kimNumber} · {b.total}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 space-y-2">
              {queue.isLoading ? (
                <div className="grid min-h-32 place-items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#ff5b14]" />
                </div>
              ) : queue.data?.items.length ? (
                queue.data.items.map(item => (
                  <button
                    key={item.taskId}
                    type="button"
                    onClick={() => {
                      setTaskId(item.taskId);
                      setSlug(item.slug);
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      taskId === item.taskId
                        ? "border-[#ff5b14] bg-[#ff5b14]/10"
                        : "border-white/8 bg-white/[.025] hover:border-[#ff5b14]/45"
                    }`}
                  >
                    <Badge variant="outline" className="border-[#e2896b]/40 text-[#e2896b]">
                      {item.kimNumber}
                    </Badge>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#ded9d2]">{excerpt(item.statementMarkdown)}</p>
                  </button>
                ))
              ) : (
                <p className="theme-muted rounded-xl border border-dashed border-white/12 p-4 text-sm">
                  Здесь пусто — по этим условиям задач без номера нет.
                </p>
              )}
            </div>

            {queue.data && queue.data.pageCount > 1 ? (
              <div className="mt-4 flex items-center justify-between text-xs">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Назад
                </Button>
                <span className="theme-muted">
                  {page} из {queue.data.pageCount} · всего {queue.data.total}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= queue.data.pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  Дальше
                </Button>
              </div>
            ) : null}
          </section>

          <section className={panel}>
            {!taskId ? (
              <p className="theme-muted text-sm">Выберите задание слева.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-[#e2896b]/40 text-[#e2896b]">
                    сейчас: {current?.kimNumber}
                  </Badge>
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[.03] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#ff8b4b]">Условие</p>
                  {detail.isLoading || !detail.data ? (
                    <div className="grid min-h-24 place-items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#ff5b14]" />
                    </div>
                  ) : (
                    <>
                      <MathMarkdown className="mt-2 text-[15px] leading-7 text-[#ded9d2]">
                        {detail.data.statementMarkdown}
                      </MathMarkdown>
                      <TaskVisuals visuals={detail.data.visuals} placement="statement" compact />
                    </>
                  )}
                </div>

                <div className="mt-5">
                  <Label className="text-xs font-bold text-[#b7b3ba]">Номер задания</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {queue.data?.numberedTypes.map(t => (
                      <button
                        key={t.kimNumber}
                        type="button"
                        onClick={() => setChosen(t.kimNumber)}
                        title={t.title}
                        className={`h-10 min-w-11 rounded-lg px-3 text-sm font-extrabold transition ${
                          chosen === t.kimNumber
                            ? "bg-[#ff5b14] text-[#101014]"
                            : "border border-white/12 text-[#c7c3ca] hover:bg-white/7"
                        }`}
                      >
                        {t.kimNumber}
                      </button>
                    ))}
                  </div>
                  {chosen ? (
                    <p className="theme-muted mt-2 text-[11px]">
                      № {chosen} · {queue.data?.numberedTypes.find(t => t.kimNumber === chosen)?.title}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => save.mutate({ taskId, kimNumber: chosen, trackSlug })}
                    disabled={!chosen || save.isPending}
                    className="rounded-xl bg-[#ff5b14] font-bold text-[#101014] hover:bg-[#ff7a35]"
                  >
                    {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Присвоить и перейти к следующему
                  </Button>
                  {slug ? (
                    <a
                      href={`/bank/${slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[#ff8b4b] hover:text-[#ffd1bb]"
                    >
                      Открыть карточку →
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
