import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Check, Loader2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

type AttemptStatus = "correct" | "incorrect" | "awaiting_review" | "reviewed" | null;

/**
 * Answer field and solve status, shown inline on a task card.
 *
 * Mirrors the ФИПИ bank: a task is «НЕ РЕШЕНО» until this account answers it,
 * then «ВЕРНО» or «НЕВЕРНО». Part 2 has no short answer to check, so it only
 * records that the work was submitted.
 */
export function TaskAnswerBox({
  taskId,
  answerKind,
  initialStatus,
}: {
  taskId: number;
  answerKind: "short_integer" | "short_decimal" | "short_text" | "manual";
  initialStatus: AttemptStatus;
}) {
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<AttemptStatus>(initialStatus);
  const [feedback, setFeedback] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const submit = trpc.learning.submitAttempt.useMutation({
    onSuccess: result => {
      setStatus(result.checkStatus);
      setFeedback(result.feedback);
      void utils.learning.progress.invalidate();
    },
    onError: error => {
      setStatus(null);
      setFeedback(error.message);
    },
  });

  const isManual = answerKind === "manual";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || submit.isPending) return;
    submit.mutate({ taskId, rawAnswer: trimmed });
  };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
      {isManual ? (
        <p className="text-xs text-[#918e95]">
          Задание части 2 — развёрнутое решение проверяет преподаватель.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex w-full max-w-sm items-center gap-2">
          <Input
            value={answer}
            onChange={event => setAnswer(event.target.value)}
            placeholder="Ответ"
            aria-label="Ваш ответ"
            inputMode="text"
            className="h-10 rounded-xl border-white/12 bg-[#121215] text-sm font-bold text-[#ece6de]"
          />
          <Button
            type="submit"
            disabled={!answer.trim() || submit.isPending}
            className="h-10 shrink-0 rounded-xl bg-[#ff5b14] px-4 text-sm font-bold text-[#101014] hover:bg-[#ff7a35]"
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ответить"}
          </Button>
        </form>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <StatusPill status={status} />
        {feedback && status === "awaiting_review" ? (
          <span className="text-xs text-[#918e95]">{feedback}</span>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AttemptStatus }) {
  if (status === "correct") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d3a28] px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#7ad39b]">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Верно
      </span>
    );
  }
  if (status === "incorrect") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d211b] px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#e2896b]">
        <X className="h-3.5 w-3.5" aria-hidden />
        Неверно
      </span>
    );
  }
  if (status === "awaiting_review" || status === "reviewed") {
    return (
      <span className="inline-flex items-center rounded-lg bg-white/6 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#c9c4cc]">
        Отправлено
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-lg bg-white/4 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#77747b]">
      Не решено
    </span>
  );
}
