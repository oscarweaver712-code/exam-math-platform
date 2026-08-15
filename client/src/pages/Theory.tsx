import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BookMarked, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

export default function Theory() {
  const [subjectSlug, setSubjectSlug] = useState<string | undefined>("mathematics");
  const [examTrackSlug, setExamTrackSlug] = useState<string | undefined>("oge-mathematics");
  const [topicSlug, setTopicSlug] = useState<string | undefined>();
  const [kimNumber, setKimNumber] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<string | null>(null);
  const overview = trpc.publicBank.overview.useQuery();
  const theory = trpc.publicBank.listTheory.useQuery({ subjectSlug, examTrackSlug, topicSlug, kimNumber });

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      <PlatformHeader />
      <main className="container py-9 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.6fr] lg:gap-14">
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2c668f]">База знаний</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.055em] text-slate-950">Теория ОГЭ</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">Короткие опорные конспекты: правило, алгоритм, частая ошибка и связь с заданиями КИМ.</p>
            <div className="mt-6 grid gap-3 rounded-2xl border border-[#dce8ef] bg-[#f5f9fb] p-4">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Предмет<select value={subjectSlug ?? ""} onChange={event => setSubjectSlug(event.target.value || undefined)} className="mt-1.5 flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"><option value="">Все предметы</option><option value="mathematics">Математика</option></select></label>
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Траектория<select value={examTrackSlug ?? ""} onChange={event => setExamTrackSlug(event.target.value || undefined)} className="mt-1.5 flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"><option value="">Все экзамены</option><option value="oge-mathematics">ОГЭ по математике</option></select></label>
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Номер КИМ<select value={kimNumber ?? ""} onChange={event => setKimNumber(event.target.value || undefined)} className="mt-1.5 flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"><option value="">Все номера</option>{overview.data?.taskTypes.map(item => <option key={item.kimNumber} value={item.kimNumber}>КИМ {item.kimNumber}</option>)}</select></label>
            </div>
            <div className="mt-7 flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
              <Button variant={!topicSlug ? "default" : "outline"} onClick={() => setTopicSlug(undefined)} className="justify-start rounded-lg">Все разделы</Button>
              {overview.data?.topics.map(topic => <Button key={topic.slug} variant={topicSlug === topic.slug ? "default" : "outline"} onClick={() => setTopicSlug(topicSlug === topic.slug ? undefined : topic.slug)} className="justify-start rounded-lg text-left">{topic.title}</Button>)}
            </div>
          </aside>
          <section>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-500"><BookMarked className="h-4 w-4 text-[#b88318]" /> {theory.data?.length ?? 0} опорных конспектов</div>
            {theory.isLoading ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#2c668f]" /></div> : null}
            <div className="space-y-3">
              {theory.data?.map(item => {
                const isOpen = expanded === item.slug;
                return (
                  <article key={item.slug} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button type="button" onClick={() => setExpanded(isOpen ? null : item.slug)} className="flex w-full items-start justify-between gap-4 p-5 text-left">
                      <div><div className="flex flex-wrap gap-2"><Badge className="bg-[#e9f2f8] text-[#225a82] hover:bg-[#e9f2f8]">{item.topicTitle}</Badge><Badge variant="outline">КИМ {item.kimNumber}</Badge></div><h2 className="mt-3 text-xl font-extrabold tracking-[-0.03em] text-slate-950">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.lead}</p></div>
                      <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? <div className="border-t border-slate-100 px-5 py-5"><div className="whitespace-pre-line text-sm leading-7 text-slate-700">{item.bodyMarkdown.replace(/## /g, "").replace(/\*\*/g, "")}</div></div> : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
