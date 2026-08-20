import { MathMarkdown } from "@/components/MathMarkdown";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaskVisuals } from "@/components/TaskVisuals";
import { trpc } from "@/lib/trpc";
import { normaliseAnswer, type AnswerKind } from "@shared/answerValidation";
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const panel = "theme-surface rounded-2xl border p-5 sm:p-6";

/**
 * A line to recognise a task by in the queue.
 *
 * The stored title is the statement's first line, which for cloned families is
 * the same sentence for a dozen tasks. The statement itself, with pictures and
 * table pipes taken out, actually tells them apart.
 */
function excerpt(statement: string): string {
  return statement
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/[*_`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export default function AdminAnswers() {
  const [kimNumber, setKimNumber] = useState<string | undefined>();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [page, setPage] = useState(1);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [variants, setVariants] = useState<string[]>([]);

  const options = trpc.school.admin.options.useQuery();
  const queue = trpc.school.admin.answerQueue.useQuery({ kimNumber, onlyMissing, page, pageSize: 20 });
  const draft = trpc.school.admin.getTask.useQuery({ taskId: taskId ?? 0 }, { enabled: !!taskId });
  const utils = trpc.useUtils();

  const save = trpc.school.admin.saveAnswer.useMutation({
    onSuccess: async () => {
      toast.success("Ответ сохранён");
      await utils.school.admin.answerQueue.invalidate();
      // Straight on to the next one: going back to the list after each save is
      // most of the work when the queue is a couple hundred long.
      const remaining = (queue.data?.items ?? []).filter(item => item.taskId !== taskId);
      setTaskId(remaining[0]?.taskId ?? null);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!draft.data) return;
    setAnswer(draft.data.correctAnswer ?? "");
    setVariants(draft.data.acceptableAnswers ?? []);
  }, [draft.data]);

  const kind = (draft.data?.answerKind ?? "short_text") as AnswerKind;
  // The exact string a student's typed answer is reduced to before comparison,
  // so the editor sees what «верно» will actually accept — «1,8» and «1.8» land
  // on the same value.
  const normalised = answer.trim() ? normaliseAnswer(answer, kind) : "";

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <section className={panel}>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Редакция</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.05em]">Ответы</h1>
          <p className="theme-muted mt-3 max-w-2xl text-sm leading-6">
            Здесь вписывается правильный ответ задачам, у которых его нет: те, что нужно
            прочитать с чертежа или графика. Форма пишет только ответ — условие, разбор и
            источник не трогает. Дальше проверка идёт сама: ученик набрал — сверилось, статик
            «решено / не решено» переключился.
          </p>
          {queue.data ? (
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">С ответом</p>
                <p className="mt-1">
                  <strong className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">{queue.data.keyed}</strong>
                  <span className="theme-muted text-sm"> задач части 1</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Ждут ответа</p>
                <p className="mt-1">
                  <strong className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">{queue.data.waiting}</strong>
                  <span className="theme-muted text-sm"> задач</span>
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className={panel}>
            <label className="text-xs font-bold text-[#b7b3ba]">
              Номер ОГЭ
              <select
                value={kimNumber ?? ""}
                onChange={event => {
                  setKimNumber(event.target.value || undefined);
                  setPage(1);
                }}
                className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#121215] px-2 text-sm font-bold text-[#ece6de]"
              >
                <option value="">Все номера</option>
                {options.data?.taskTypes.map(item => (
                  <option key={item.kimNumber} value={item.kimNumber}>
                    № {item.kimNumber} · {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#b7b3ba]">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={event => {
                  setOnlyMissing(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-[#ff5b14]"
              />
              Только без ответа
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
                    onClick={() => setTaskId(item.taskId)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      taskId === item.taskId
                        ? "border-[#ff5b14] bg-[#ff5b14]/10"
                        : "border-white/8 bg-white/[.025] hover:border-[#ff5b14]/45"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="border-0 bg-[#ff5b14] text-[#101014] hover:bg-[#ff5b14]">
                        № {item.kimNumber}
                      </Badge>
                      {item.hasKey ? <Check className="h-3.5 w-3.5 text-[#7ad39b]" /> : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#ded9d2]">
                      {excerpt(item.statementMarkdown) || item.title}
                    </p>
                  </button>
                ))
              ) : (
                <p className="theme-muted rounded-xl border border-dashed border-white/12 p-4 text-sm">
                  Здесь пусто — по этим условиям задач без ответа нет.
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
            ) : draft.isLoading || !draft.data ? (
              <div className="grid min-h-52 place-items-center">
                <Loader2 className="h-7 w-7 animate-spin text-[#ff5b14]" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-0 bg-[#ff5b14] text-[#101014] hover:bg-[#ff5b14]">
                    ОГЭ № {draft.data.kimNumber}
                  </Badge>
                  {draft.data.correctAnswer ? (
                    <Badge variant="outline" className="border-white/12 text-[#b9b5bc]">
                      уже есть: {draft.data.correctAnswer}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-[#e2896b]/40 text-[#e2896b]">
                      без ответа
                    </Badge>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[.03] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#ff8b4b]">Условие</p>
                  <MathMarkdown className="mt-2 text-[15px] leading-7 text-[#ded9d2]">
                    {draft.data.statementMarkdown}
                  </MathMarkdown>
                  <TaskVisuals visuals={draft.data.visuals} placement="statement" compact />
                </div>

                <div className="mt-5">
                  <Label className="text-xs font-bold text-[#b7b3ba]">Правильный ответ</Label>
                  <Input
                    value={answer}
                    onChange={event => setAnswer(event.target.value)}
                    placeholder="Например: 12  или  13.5"
                    className="mt-2 text-sm"
                  />
                  {normalised ? (
                    <p className="theme-muted mt-2 text-[11px] leading-5">
                      Засчитается как{" "}
                      <code className="rounded bg-white/8 px-1.5 py-0.5 font-['Space_Grotesk'] text-[#7ad39b]">
                        {normalised}
                      </code>{" "}
                      — ученик, набравший это в любой записи (запятая или точка), получит «верно».
                    </p>
                  ) : null}
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs font-bold text-[#b7b3ba]">Другие верные записи</Label>
                    {variants.length < 10 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setVariants([...variants, ""])}
                        className="gap-1 text-xs text-[#ff8b4b] hover:bg-[#ff5b14]/10"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Добавить
                      </Button>
                    ) : null}
                  </div>
                  <p className="theme-muted mt-1 text-[11px]">
                    Нужны редко — когда у задачи несколько равноправных форм ответа.
                  </p>
                  {variants.length ? (
                    <div className="mt-3 space-y-2">
                      {variants.map((value, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={value}
                            onChange={event =>
                              setVariants(variants.map((v, i) => (i === index ? event.target.value : v)))
                            }
                            placeholder="Ещё один верный ответ"
                            className="h-9 text-sm"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setVariants(variants.filter((_, i) => i !== index))}
                            className="h-9 w-9 shrink-0 text-[#e2896b] hover:bg-[#e2896b]/10"
                            aria-label="Убрать запись"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() =>
                      save.mutate({
                        taskId,
                        correctAnswer: answer.trim(),
                        acceptableAnswers: variants.map(v => v.trim()).filter(Boolean),
                      })
                    }
                    disabled={answer.trim().length < 1 || save.isPending}
                    className="rounded-xl bg-[#ff5b14] font-bold text-[#101014] hover:bg-[#ff7a35]"
                  >
                    {save.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Сохранить и перейти к следующему
                  </Button>
                  <a
                    href={`/bank/${draft.data.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-[#ff8b4b] hover:text-[#ffd1bb]"
                  >
                    Открыть карточку ученика →
                  </a>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
