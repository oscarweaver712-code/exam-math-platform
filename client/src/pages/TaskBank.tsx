import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Filter, ListFilter, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

const difficultyLabel = { basic: "Базовый", standard: "Стандарт", advanced: "Повышенный" };

export default function TaskBank() {
  const [topicSlug, setTopicSlug] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<"basic" | "standard" | "advanced" | undefined>();
  const [part, setPart] = useState<"part1" | "part2" | undefined>();
  const [kimNumber, setKimNumber] = useState<string | undefined>();
  const overview = trpc.publicBank.overview.useQuery();
  const tasks = trpc.publicBank.listTasks.useQuery({ topicSlug, difficulty, part, kimNumber });

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      <PlatformHeader />
      <main className="container py-9 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2c668f]">Открытый банк</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-5xl">Задания ОГЭ по математике</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Выбирайте тему, номер КИМ или сложность. Условия, ответы и подробные разборы доступны без регистрации.</p>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-700"><Filter className="h-4 w-4 text-[#2c668f]" /> Фильтры</div>
            <div className="flex flex-wrap gap-2">
              <Button variant={!topicSlug ? "default" : "outline"} size="sm" onClick={() => setTopicSlug(undefined)} className="rounded-lg">Все темы</Button>
              {overview.data?.topics.map(topic => (
                <Button key={topic.slug} variant={topicSlug === topic.slug ? "default" : "outline"} size="sm" onClick={() => setTopicSlug(topicSlug === topic.slug ? undefined : topic.slug)} className="rounded-lg">
                  {topic.title}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><ListFilter className="mr-1 inline h-3 w-3" />Сложность</span>
            {(["basic", "standard", "advanced"] as const).map(level => (
              <button key={level} type="button" onClick={() => setDifficulty(difficulty === level ? undefined : level)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${difficulty === level ? "bg-[#0d2945] text-white" : "bg-[#f3f6f8] text-slate-600 hover:bg-[#e6edf1]"}`}>
                {difficultyLabel[level]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Часть</span>
            <button type="button" onClick={() => setPart(undefined)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${!part ? "bg-[#0d2945] text-white" : "bg-[#f3f6f8] text-slate-600 hover:bg-[#e6edf1]"}`}>Все</button>
            <button type="button" onClick={() => setPart(part === "part1" ? undefined : "part1")} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${part === "part1" ? "bg-[#0d2945] text-white" : "bg-[#f3f6f8] text-slate-600 hover:bg-[#e6edf1]"}`}>Часть 1</button>
            <button type="button" onClick={() => setPart(part === "part2" ? undefined : "part2")} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${part === "part2" ? "bg-[#0d2945] text-white" : "bg-[#f3f6f8] text-slate-600 hover:bg-[#e6edf1]"}`}>Часть 2</button>
            <span className="ml-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">КИМ</span>
            {overview.data?.taskTypes.map(item => (
              <button key={item.kimNumber} type="button" onClick={() => setKimNumber(kimNumber === item.kimNumber ? undefined : item.kimNumber)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${kimNumber === item.kimNumber ? "bg-[#e9c46a] text-[#0d2945]" : "bg-[#fdf7e9] text-[#765510] hover:bg-[#f8ebc5]"}`}>{item.kimNumber}</button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-500">{tasks.data?.length ?? 0} заданий в подборке</p>
            <p className="text-xs font-semibold text-slate-400">Авторский демонстрационный набор</p>
          </div>
          {tasks.isLoading ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#2c668f]" /></div> : null}
          <div className="grid gap-3">
            {tasks.data?.map(task => (
              <Link key={task.id} href={`/bank/${task.slug}`} className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_3px_12px_rgba(15,35,55,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b2cadb] hover:shadow-[0_12px_30px_rgba(15,35,55,0.08)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2"><Badge className="bg-[#e9f2f8] text-[#225a82] hover:bg-[#e9f2f8]">КИМ {task.kimNumber}</Badge><Badge variant="outline">Часть {task.part === "part1" ? "1" : "2"}</Badge><Badge variant="outline">{task.topicTitle}</Badge></div>
                    <h2 className="mt-3 text-lg font-extrabold tracking-[-0.025em] text-slate-950">{task.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{task.statementMarkdown}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-sm font-extrabold text-[#245d87]">Решать <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
