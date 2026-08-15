import { Button } from "@/components/ui/button";
import { GraduationCap, Presentation, Sparkles } from "lucide-react";

export function RoleSelection({
  onSelect,
  isPending,
}: {
  onSelect: (role: "student" | "tutor") => void;
  isPending: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-[#d9e4ed] bg-white shadow-[0_18px_50px_rgba(31,52,71,0.08)]">
      <div className="border-b border-[#e9eff3] bg-[#f6fafc] px-6 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9c46a] text-[#0d2945]"><Sparkles className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-bold text-[#0d2945]">Первый вход</p>
            <h2 className="text-xl font-extrabold tracking-[-0.035em] text-slate-950">Для чего вы будете использовать платформу?</h2>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onSelect("student")}
          className="group rounded-2xl border border-slate-200 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2a5b84] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a5b84]"
        >
          <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#e8f1f7] text-[#1b527d]"><GraduationCap className="h-5 w-5" /></span>
          <h3 className="text-base font-extrabold text-slate-950">Я ученик</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Сохранять задания, отслеживать темы и получать домашнюю работу от преподавателя.</p>
          <span className="mt-5 inline-flex text-sm font-bold text-[#1b527d]">Выбрать ученика →</span>
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onSelect("tutor")}
          className="group rounded-2xl border border-slate-200 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2a5b84] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a5b84]"
        >
          <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#fdf0d0] text-[#8a5f00]"><Presentation className="h-5 w-5" /></span>
          <h3 className="text-base font-extrabold text-slate-950">Я репетитор</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Собирать задания из банка и видеть результаты учеников, когда подключится модуль сопровождения.</p>
          <span className="mt-5 inline-flex text-sm font-bold text-[#8a5f00]">Выбрать репетитора →</span>
        </button>
      </div>
      <div className="flex justify-end border-t border-slate-100 px-6 py-3 sm:px-8">
        <Button variant="ghost" size="sm" disabled className="text-xs text-slate-400">Роль меняет администратор</Button>
      </div>
    </section>
  );
}
