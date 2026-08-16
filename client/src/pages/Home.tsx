import { PlatformHeader } from "@/components/PlatformHeader";
import { TutorTelegramBanner } from "@/components/TutorTelegramBanner";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpenCheck, ClipboardList, Sparkles } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main>
        <section className="obsidian-grid relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_28%,rgba(255,91,20,.23),transparent_28%),radial-gradient(circle_at_12%_85%,rgba(255,148,86,.08),transparent_30%)]" />
          <div className="container relative grid min-h-[620px] items-center gap-10 py-14 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
            <div>
              <p className="inline-flex rounded-full border border-[#ff5b14]/40 bg-[#ff5b14]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#ff8a4c]">ОГЭ по математике · бесплатно</p>
              <h1 className="mt-7 max-w-3xl font-['Space_Grotesk'] text-5xl font-bold leading-[.94] tracking-[-.075em] sm:text-7xl">Решайте.<br /><span className="text-[#ff5b14]">Понимайте.</span><br />Продвигайтесь.</h1>
              <p className="theme-muted mt-7 max-w-xl text-base leading-7 sm:text-lg">Задания ОГЭ с понятными решениями, подсказками и прозрачными источниками. Начните без регистрации — выбирайте только то, что нужно сейчас.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/bank"><Button size="lg" className="rounded-xl bg-[#ff5b14] px-6 font-extrabold text-[#101014] hover:bg-[#ff7a35]">Найти задание<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
                <Link href="/variants"><Button size="lg" variant="outline" className="rounded-xl border-white/18 bg-white/5 px-6 font-extrabold text-[#f5f0e9] hover:bg-white/10">Решать вариант</Button></Link>
              </div>
              <p className="mt-7 text-sm font-medium text-[#8e8b91]">Без регистрации · без навязчивой структуры · с разбором по запросу</p>
            </div>
            <div className="grid gap-3">
              <Link href="/bank"><article className="surface-card group rounded-2xl p-6 transition hover:border-[#ff5b14]/55"><BookOpenCheck className="h-7 w-7 text-[#ff5b14]" /><h2 className="mt-5 text-2xl font-bold">Мне нужно задание</h2><p className="theme-muted mt-2 text-sm leading-6">Откройте банк, выберите номер или тему — и переходите к решению.</p><span className="mt-5 inline-flex items-center text-sm font-bold text-[#ff8b4b]">Открыть задания <ArrowRight className="ml-2 h-4 w-4" /></span></article></Link>
              <Link href="/variants"><article className="surface-card group rounded-2xl p-6 transition hover:border-[#ff5b14]/55"><ClipboardList className="h-7 w-7 text-[#ff7a35]" /><h2 className="mt-5 text-2xl font-bold">Хочу потренироваться</h2><p className="theme-muted mt-2 text-sm leading-6">Возьмите готовый вариант или соберите новую последовательность из 25 заданий.</p><span className="mt-5 inline-flex items-center text-sm font-bold text-[#ff8b4b]">Перейти к вариантам <ArrowRight className="ml-2 h-4 w-4" /></span></article></Link>
              <Link href="/subjects"><article className="rounded-2xl border border-white/8 bg-white/[.025] p-5 transition hover:border-white/20"><Sparkles className="h-5 w-5 text-[#ff9a61]" /><p className="mt-3 text-sm font-bold">Нужен другой экзамен?</p><p className="theme-muted mt-1 text-xs">Выберите предмет и доступную траекторию.</p></article></Link>
            </div>
          </div>
        </section>
        <section className="container py-8 sm:py-12"><TutorTelegramBanner /></section>
      </main>
    </div>
  );
}
