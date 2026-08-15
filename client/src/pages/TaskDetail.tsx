import { useAuth } from "@/_core/hooks/useAuth";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Bookmark, CheckCircle2, ChevronLeft, CircleHelp, Loader2, LockKeyhole, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";

export default function TaskDetail() {
  const [, params] = useRoute("/bank/:slug");
  const slug = params?.slug ?? "";
  const { isAuthenticated } = useAuth();
  const task = trpc.publicBank.getTask.useQuery({ slug }, { enabled: Boolean(slug) });
  const guestCheck = trpc.publicBank.checkAnswer.useMutation();
  const learningCheck = trpc.learning.submitAttempt.useMutation();
  const saveTask = trpc.learning.saveTask.useMutation();
  const [answer, setAnswer] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const result = learningCheck.data ?? guestCheck.data;

  const submit = () => {
    if (!task.data || !answer.trim()) return;
    if (isAuthenticated) learningCheck.mutate({ taskId: task.data.id, rawAnswer: answer });
    else guestCheck.mutate({ taskId: task.data.id, rawAnswer: answer });
  };

  if (task.isLoading) return <div className="grid min-h-screen place-items-center bg-[#fbfaf7]"><Loader2 className="h-8 w-8 animate-spin text-[#2c668f]" /></div>;
  if (!task.data) return <div className="min-h-screen bg-[#fbfaf7]"><PlatformHeader /><main className="container py-20"><p>Задание не найдено.</p></main></div>;

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <Link href="/bank" className="inline-flex items-center gap-1 text-sm font-bold text-[#245d87] hover:text-[#0d2945]"><ChevronLeft className="h-4 w-4" /> Вернуться к банку</Link>
        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(31,52,71,0.07)] sm:p-9">
            <div className="flex flex-wrap items-center gap-2"><Badge className="bg-[#e9f2f8] text-[#225a82] hover:bg-[#e9f2f8]">КИМ {task.data.kimNumber}</Badge><Badge variant="outline">Часть {task.data.part === "part1" ? "1" : "2"}</Badge><Badge variant="outline">{task.data.topicTitle}</Badge></div>
            <div className="mt-7"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">Задание</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-slate-950">{task.data.title}</h1><p className="mt-7 text-lg leading-8 text-slate-800">{task.data.statementMarkdown}</p></div>
            {task.data.part === "part1" ? <section className="mt-9 rounded-2xl bg-[#f5f9fc] p-5 sm:p-6"><div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-[#2c668f]" /><p className="text-sm font-extrabold text-[#153b5a]">Введите краткий ответ</p></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => event.key === "Enter" && submit()} placeholder="Например, 12 или 0,6" className="h-11 rounded-lg bg-white text-base" /><Button onClick={submit} disabled={!answer.trim() || guestCheck.isPending || learningCheck.isPending} className="h-11 rounded-lg bg-[#0d2945] px-6 font-bold">Проверить</Button></div>{result ? <div className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm ${result.checkStatus === "correct" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{result.checkStatus === "correct" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}<div><p className="font-extrabold">{result.checkStatus === "correct" ? "Верный ответ" : "Ответ не засчитан"}</p><p className="mt-1 leading-5">{result.feedback}</p>{!isAuthenticated ? <p className="mt-2 flex items-center gap-1 text-xs font-bold"><LockKeyhole className="h-3.5 w-3.5" /> Войдите, чтобы сохранить результат в прогрессе.</p> : null}</div></div> : null}</section> : <section className="mt-9 rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-900">Ответ на задание Части 2 сохраняется и проверяется преподавателем вручную.</section>}
            <div className="mt-7 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setShowSolution(!showSolution)} className="rounded-lg">{showSolution ? "Скрыть решение" : "Показать решение"}</Button>{isAuthenticated ? <Button variant="ghost" onClick={() => saveTask.mutate({ taskId: task.data.id })} className="gap-2 rounded-lg text-[#245d87]"><Bookmark className="h-4 w-4" /> Сохранить</Button> : null}</div>
            {showSolution ? <section className="mt-7 border-t border-slate-100 pt-7"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2c668f]">Разбор</p><p className="mt-3 whitespace-pre-line text-base leading-8 text-slate-700">{task.data.solutionMarkdown}</p></section> : null}
          </article>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit"><section className="rounded-2xl border border-[#dce9f1] bg-[#eff6fa] p-5"><p className="text-sm font-extrabold text-[#173e5c]">Связано с теорией</p><div className="mt-3 space-y-3">{task.data.relatedTheory.map(item => <Link key={item.slug} href="/theory" className="block rounded-xl bg-white p-3 text-sm shadow-sm transition hover:shadow"><p className="font-extrabold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 leading-5 text-slate-600">{item.lead}</p></Link>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-extrabold text-slate-900">В этом задании</p><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Тип</dt><dd className="text-right font-bold text-slate-800">{task.data.taskType}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Сложность</dt><dd className="font-bold text-slate-800">{task.data.difficulty === "basic" ? "Базовый" : task.data.difficulty === "standard" ? "Стандарт" : "Повышенный"}</dd></div></dl></section></aside>
        </div>
      </main>
    </div>
  );
}
