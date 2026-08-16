import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, ExternalLink, FileImage, Filter, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const sourceLabel = {
  author: "Авторский учебный материал",
  fipi: "Проверяемый источник ФИПИ",
  partner: "Проверяемый внешний источник",
} as const;

function FilterPill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition ${active ? "border-[#ff5b14] bg-[#ff5b14] text-[#101014]" : "border-white/10 bg-white/5 text-[#aba7ae] hover:border-white/25 hover:bg-white/9 hover:text-white"}`}>{children}</button>;
}

export default function TaskBank() {
  const [topicSlug, setTopicSlug] = useState<string | undefined>();
  const [part, setPart] = useState<"part1" | "part2" | undefined>();
  const [kimNumber, setKimNumber] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const overview = trpc.publicBank.overview.useQuery();
  const taskPage = trpc.publicBank.listTasks.useQuery({ topicSlug, part, kimNumber, page, pageSize: 12 });
  const tasks = taskPage.data;
  const choose = (action: () => void) => { action(); setPage(1); };
  const reset = () => { setTopicSlug(undefined); setPart(undefined); setKimNumber(undefined); setPage(1); };

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main className="container py-8 sm:py-12">
        <section className="flex flex-col gap-5 border-b border-white/9 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#ff7a35]">ОГЭ · математика</p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-.06em] sm:text-5xl">Задания</h1>
            <p className="theme-muted mt-3 max-w-xl leading-6">Выберите номер или тему. В карточке — только то, что нужно перед решением: место в экзамене, источник и схема.</p>
          </div>
          <p className="theme-muted text-sm"><strong className="font-['Space_Grotesk'] text-3xl text-[#ff5b14]">{overview.data?.taskCount ?? tasks?.total ?? 0}</strong> опубликованных задач</p>
        </section>
        <section className="theme-surface mt-6 rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff5b14] text-[#101014]"><Filter className="h-4 w-4" /></span>Найти задание</div><Button variant="ghost" size="sm" onClick={reset} className="gap-2 text-[#ff8b4b] hover:bg-[#ff5b14]/10 hover:text-[#ffb187]"><RotateCcw className="h-3.5 w-3.5" />Сбросить</Button></div>
          <div className="mt-5 space-y-4">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#77747b]">Номер ОГЭ</p><div className="mt-2 flex flex-wrap gap-2"><FilterPill active={!kimNumber} onClick={() => choose(() => setKimNumber(undefined))}>Все</FilterPill>{overview.data?.taskTypes.map(item => <FilterPill key={item.kimNumber} active={kimNumber === item.kimNumber} onClick={() => choose(() => setKimNumber(kimNumber === item.kimNumber ? undefined : item.kimNumber))}>№ {item.kimNumber}</FilterPill>)}</div></div>
            <div className="grid gap-4 lg:grid-cols-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#77747b]">Тема</p><div className="mt-2 flex flex-wrap gap-2"><FilterPill active={!topicSlug} onClick={() => choose(() => setTopicSlug(undefined))}>Все темы</FilterPill>{overview.data?.topics.map(topic => <FilterPill key={topic.slug} active={topicSlug === topic.slug} onClick={() => choose(() => setTopicSlug(topicSlug === topic.slug ? undefined : topic.slug))}>{topic.title}</FilterPill>)}</div></div><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#77747b]">Часть</p><div className="mt-2 flex flex-wrap gap-2"><FilterPill active={!part} onClick={() => choose(() => setPart(undefined))}>Все</FilterPill><FilterPill active={part === "part1"} onClick={() => choose(() => setPart(part === "part1" ? undefined : "part1"))}>Часть 1</FilterPill><FilterPill active={part === "part2"} onClick={() => choose(() => setPart(part === "part2" ? undefined : "part2"))}>Часть 2</FilterPill></div></div></div>
          </div>
        </section>
        <section className="mt-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold">Найдено: <span className="font-['Space_Grotesk'] text-2xl text-[#ff5b14]">{tasks?.total ?? 0}</span></p><p className="theme-muted text-xs">Страница {tasks?.page ?? 1} из {tasks?.pageCount ?? 1} · по 12 задач</p></div>
          {taskPage.isLoading ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#ff5b14]" /></div> : tasks?.items.length ? <><div className="space-y-3">{tasks.items.map(task => <article key={task.id} className="group rounded-2xl border border-white/9 bg-white/3 p-5 transition hover:border-[#ff5b14]/65 hover:bg-[#ff5b14]/5"><Link href={`/bank/${task.slug}`} className="block"><div className="flex gap-4 sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className="border-0 bg-[#ff5b14] text-[#101014] hover:bg-[#ff5b14]">№ {task.kimNumber}</Badge><Badge variant="outline" className="border-white/12 text-[#aaa7ae]">{task.taskType}</Badge><Badge variant="outline" className="border-white/12 text-[#aaa7ae]">Часть {task.part === "part1" ? "1" : "2"}</Badge>{task.hasReviewedVisual ? <Badge className="gap-1 border-0 bg-sky-400/12 text-sky-200 hover:bg-sky-400/12"><FileImage className="h-3 w-3" />Схема</Badge> : null}</div><p className="theme-muted mt-3 line-clamp-2 max-w-3xl text-sm leading-6">{task.statementMarkdown}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#ff7a35] transition-transform group-hover:translate-x-1" /></div></Link><div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/8 pt-4 text-xs"><span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 font-bold text-[#d7d1c9]"><ShieldCheck className="h-3.5 w-3.5 text-[#ff8b4b]" />{sourceLabel[task.sourceKind]}</span>{task.sourceTitle ? <span className="theme-muted">{task.sourceTitle}</span> : null}{task.sourceUrl ? <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-[#ff8b4b] hover:text-[#ffb187]">Источник<ExternalLink className="h-3.5 w-3.5" /></a> : null}</div></article>)}</div><div className="mt-6 flex items-center justify-between"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ArrowLeft className="mr-2 h-4 w-4" />Назад</Button><Button disabled={page >= tasks.pageCount} onClick={() => setPage(current => Math.min(tasks.pageCount, current + 1))} className="bg-[#ff5b14] text-[#101014] hover:bg-[#ff7a35]">Дальше<ArrowRight className="ml-2 h-4 w-4" /></Button></div></> : <div className="theme-surface rounded-2xl border border-dashed p-8"><p className="font-bold">Проверенные задания ОГЭ готовятся к публикации.</p><p className="theme-muted mt-2 max-w-xl text-sm leading-6">В банк попадут только материалы с подтверждёнными годом ОГЭ и первоисточником. Архивные тренировочные записи не показываются ученикам.</p><Button onClick={reset} className="mt-4 rounded-xl bg-[#ff5b14] font-bold text-[#101014] hover:bg-[#ff7a35]">Сбросить фильтры</Button></div>}
        </section>
      </main>
    </div>
  );
}
