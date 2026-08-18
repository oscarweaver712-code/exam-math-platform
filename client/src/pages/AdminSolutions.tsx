import { MathMarkdown } from "@/components/MathMarkdown";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskVisuals } from "@/components/TaskVisuals";
import { trpc } from "@/lib/trpc";
import { Check, Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Block = { title: string; bodyMarkdown: string };
type Part = "part1" | "part2";

const panel = "theme-surface rounded-2xl border p-5 sm:p-6";

/**
 * A line to recognise a task by in the queue.
 *
 * The stored title is the statement's first line, which for part 2 is usually
 * the single word «Решите» — twenty identical rows. The statement itself, with
 * its pictures and table pipes taken out, actually distinguishes them.
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

/** A repeated title + markdown pair: a step of the разбор, or a hint. */
function Blocks({
  label,
  hint,
  blocks,
  onChange,
  limit,
}: {
  label: string;
  hint: string;
  blocks: Block[];
  onChange: (next: Block[]) => void;
  limit: number;
}) {
  const patch = (index: number, part: Partial<Block>) =>
    onChange(blocks.map((block, position) => (position === index ? { ...block, ...part } : block)));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-bold text-[#b7b3ba]">{label}</Label>
        {blocks.length < limit ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([...blocks, { title: "", bodyMarkdown: "" }])}
            className="gap-1 text-xs text-[#ff8b4b] hover:bg-[#ff5b14]/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        ) : null}
      </div>
      <p className="theme-muted mt-1 text-[11px]">{hint}</p>
      <div className="mt-3 space-y-3">
        {blocks.map((block, index) => (
          <div key={index} className="rounded-xl border border-white/8 bg-white/[.025] p-3">
            <div className="flex gap-2">
              <Input
                value={block.title}
                onChange={event => patch(index, { title: event.target.value })}
                placeholder={`Шаг ${index + 1}`}
                className="h-9 text-sm"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChange(blocks.filter((_, position) => position !== index))}
                className="h-9 w-9 shrink-0 text-[#e2896b] hover:bg-[#e2896b]/10"
                aria-label="Убрать блок"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={block.bodyMarkdown}
              onChange={event => patch(index, { bodyMarkdown: event.target.value })}
              rows={3}
              placeholder="Текст с формулами: $x^2$"
              className="mt-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminSolutions() {
  const [part, setPart] = useState<Part | undefined>("part2");
  const [kimNumber, setKimNumber] = useState<string | undefined>();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [page, setPage] = useState(1);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [solution, setSolution] = useState("");
  const [steps, setSteps] = useState<Block[]>([]);
  const [hints, setHints] = useState<Block[]>([]);
  const [preview, setPreview] = useState(false);

  const options = trpc.school.admin.options.useQuery();
  const queue = trpc.school.admin.solutionQueue.useQuery({ part, kimNumber, onlyMissing, page, pageSize: 20 });
  const draft = trpc.school.admin.getTask.useQuery({ taskId: taskId ?? 0 }, { enabled: !!taskId });
  const utils = trpc.useUtils();

  const save = trpc.school.admin.saveSolution.useMutation({
    onSuccess: async () => {
      toast.success("Разбор сохранён");
      await utils.school.admin.solutionQueue.invalidate();
      // Straight on to the next one: this queue is 909 tasks long, and going
      // back to the list after each save is most of the work.
      const remaining = (queue.data?.items ?? []).filter(item => item.taskId !== taskId);
      setTaskId(remaining[0]?.taskId ?? null);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!draft.data) return;
    const written = draft.data.solutionMarkdown && !draft.data.solutionMarkdown.startsWith("_Разбор ещё не написан._");
    setSolution(written ? draft.data.solutionMarkdown : "");
    setSteps(draft.data.solutionSteps.map(step => ({ title: step.title, bodyMarkdown: step.bodyMarkdown })));
    setHints(draft.data.hints.map(hint => ({ title: hint.title, bodyMarkdown: hint.bodyMarkdown })));
    setPreview(false);
  }, [draft.data]);

  const progress = queue.data?.progress ?? [];
  const waiting = progress.reduce((sum, row) => sum + row.waiting, 0);
  const total = progress.reduce((sum, row) => sum + row.total, 0);
  const filled = (blocks: Block[]) => blocks.filter(block => block.title.trim() && block.bodyMarkdown.trim());

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <section className={panel}>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Редакция</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.05em]">Разборы</h1>
          <p className="theme-muted mt-3 max-w-2xl text-sm leading-6">
            ФИПИ решений не публикует, поэтому у части 2 нет ничего, кроме разбора: развёрнутый
            ответ машина не проверит, его можно только объяснить. Здесь пишется объяснение —
            и ничего больше: условие, ответ и источник задания эта форма не трогает.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {progress.map(row => (
              <div key={row.part}>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">
                  {row.part === "part1" ? "Часть 1" : "Часть 2"}
                </p>
                <p className="mt-1">
                  <strong className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">
                    {row.total - row.waiting}
                  </strong>
                  <span className="theme-muted text-sm"> из {row.total} с разбором</span>
                </p>
              </div>
            ))}
            {total ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Ждут</p>
                <p className="mt-1">
                  <strong className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">{waiting}</strong>
                  <span className="theme-muted text-sm"> заданий</span>
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className={panel}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="text-xs font-bold text-[#b7b3ba]">
                Часть
                <select
                  value={part ?? ""}
                  onChange={event => {
                    setPart((event.target.value || undefined) as Part | undefined);
                    setPage(1);
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#121215] px-2 text-sm font-bold text-[#ece6de]"
                >
                  <option value="">Обе части</option>
                  <option value="part2">Часть 2 — только разбор</option>
                  <option value="part1">Часть 1</option>
                </select>
              </label>
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
            </div>
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
              Только без разбора
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
                      {item.written ? <Check className="h-3.5 w-3.5 text-[#7ad39b]" /> : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#ded9d2]">
                      {excerpt(item.statementMarkdown) || item.title}
                    </p>
                  </button>
                ))
              ) : (
                <p className="theme-muted rounded-xl border border-dashed border-white/12 p-4 text-sm">
                  Здесь пусто — по этим условиям заданий без разбора нет.
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
                  <Badge variant="outline" className="border-white/12 text-[#b9b5bc]">
                    {draft.data.answerKind === "manual" ? "развёрнутый ответ" : "краткий ответ"}
                  </Badge>
                  {draft.data.correctAnswer ? (
                    <Badge variant="outline" className="border-white/12 text-[#b9b5bc]">
                      ключ: {draft.data.correctAnswer}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[.03] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#ff8b4b]">Условие</p>
                  <MathMarkdown className="mt-2 text-[15px] leading-7 text-[#ded9d2]">
                    {draft.data.statementMarkdown}
                  </MathMarkdown>
                  <TaskVisuals visuals={draft.data.visuals} placement="statement" compact />
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs font-bold text-[#b7b3ba]">Разбор</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreview(value => !value)}
                      className="gap-1 text-xs text-[#ff8b4b] hover:bg-[#ff5b14]/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {preview ? "Править" : "Как увидит ученик"}
                    </Button>
                  </div>
                  {preview ? (
                    <div className="mt-2 min-h-40 rounded-xl border border-white/8 bg-white/[.025] p-4">
                      <MathMarkdown className="text-[15px] leading-7 text-[#ded9d2]">
                        {solution || "_Пока пусто._"}
                      </MathMarkdown>
                    </div>
                  ) : (
                    <Textarea
                      value={solution}
                      onChange={event => setSolution(event.target.value)}
                      rows={10}
                      placeholder="Ход решения. Формулы в долларах: $S = \frac{ah}{2}$"
                      className="mt-2 text-sm"
                    />
                  )}
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <Blocks
                    label="Шаги разбора"
                    hint="Раскрываются по одному — ученик может остановиться, когда понял."
                    blocks={steps}
                    onChange={setSteps}
                    limit={12}
                  />
                  <Blocks
                    label="Подсказки"
                    hint="Короткая мысль, которая сдвинет с места, но не выдаст ответ."
                    blocks={hints}
                    onChange={setHints}
                    limit={6}
                  />
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() =>
                      save.mutate({
                        taskId,
                        solutionMarkdown: solution,
                        steps: filled(steps),
                        hints: filled(hints),
                      })
                    }
                    disabled={solution.trim().length < 10 || save.isPending}
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
