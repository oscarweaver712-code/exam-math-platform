import { useAuth } from "@/_core/hooks/useAuth";
import { PlatformHeader } from "@/components/PlatformHeader";
import { TutorTelegramBanner } from "@/components/TutorTelegramBanner";
import { Button } from "@/components/ui/button";
import { getHomeActions } from "@/lib/homeActions";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Camera, CheckCircle2, FileText } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated });
  const actions = getHomeActions(isAuthenticated, profile.data?.learningRole);
  const PrimaryIcon = actions.primary.icon;
  const SecondaryIcon = actions.secondary.icon;

  return (
    <div className="theme-page min-h-screen">
      <PlatformHeader />
      <main>
        <section className="container py-2 sm:py-3"><TutorTelegramBanner /></section>
        <section className="obsidian-grid relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_28%,rgba(255,91,20,.23),transparent_28%),radial-gradient(circle_at_12%_85%,rgba(255,148,86,.08),transparent_30%)]" />
          <div className="container relative grid items-start gap-8 py-8 sm:py-10 lg:grid-cols-[1.1fr_.9fr] lg:py-12">
            <div>
              <p className="inline-flex rounded-full border border-[#ff5b14]/40 bg-[#ff5b14]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#ff8a4c]">ОГЭ по математике · практика</p>
              <h1 className="mt-5 max-w-3xl font-['Space_Grotesk'] text-5xl font-bold leading-[.94] tracking-[-.075em] sm:text-7xl">Решайте.<br /><span className="text-[#ff5b14]">Понимайте.</span><br />Продвигайтесь.</h1>
              <p className="theme-muted mt-6 max-w-xl text-base leading-7 sm:text-lg">Практикуйтесь на конкретных заданиях ОГЭ. В карточке есть условие, при необходимости фото или схема, а дальше — ответ или подробный разбор.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={actions.primary.href}><Button size="lg" className="rounded-xl bg-[#ff5b14] px-6 font-extrabold text-[#101014] hover:bg-[#ff7a35]"><PrimaryIcon className="mr-2 h-4 w-4" />{actions.primary.label}</Button></Link>
                <Link href={actions.secondary.href}><Button size="lg" variant="outline" className="rounded-xl border-white/18 bg-white/5 px-6 font-extrabold text-[#f5f0e9] hover:bg-white/10"><SecondaryIcon className="mr-2 h-4 w-4" />{actions.secondary.label}<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              </div>
              <p className="mt-5 max-w-xl text-sm font-medium leading-6 text-[#8e8b91]">{actions.helper}</p>
            </div>
            <section aria-label="Как устроено задание" className="grid gap-3">
              <article className="surface-card rounded-2xl p-5 sm:p-6"><FileText className="h-6 w-6 text-[#ff5b14]" /><h2 className="mt-4 text-xl font-bold">Условие и материалы</h2><p className="theme-muted mt-2 text-sm leading-6">Читайте условие сразу. Если к задаче приложены фото, таблица или схема, они видны в самой карточке.</p></article>
              <article className="surface-card rounded-2xl p-5 sm:p-6"><CheckCircle2 className="h-6 w-6 text-[#ff7a35]" /><h2 className="mt-4 text-xl font-bold">Часть 1 — краткий ответ</h2><p className="theme-muted mt-2 text-sm leading-6">Введите число или короткий ответ и сразу получите результат проверки.</p></article>
              <article className="rounded-2xl border border-[#ff5b14]/25 bg-[#ff5b14]/7 p-5 sm:p-6"><Camera className="h-6 w-6 text-[#ff9a61]" /><h2 className="mt-4 text-xl font-bold">Часть 2 — развёрнутый разбор</h2><p className="theme-muted mt-2 text-sm leading-6">Смотрите ход решения по шагам, а также добавленные фотографии и схемы, когда они нужны.</p></article>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
