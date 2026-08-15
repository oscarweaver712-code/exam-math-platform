import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { BookOpenCheck, Menu, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";

const links = [
  { href: "/bank", label: "Задания" },
  { href: "/theory", label: "Теория" },
  { href: "/practice", label: "Практика" },
  { href: "/workspace", label: "Мой тренажёр" },
];

export function PlatformHeader() {
  const { isAuthenticated, loading, user } = useAuth();
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-[#fbfaf7]/92 backdrop-blur-xl">
      <div className="container flex h-[72px] items-center justify-between gap-4">
        <Link href="/" className="group flex items-center gap-3 text-slate-950">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0d2945] shadow-[0_6px_18px_rgba(13,41,69,0.18)] transition-transform duration-200 group-hover:scale-105">
            <BookOpenCheck className="h-5 w-5 text-[#e9c46a]" strokeWidth={2.4} />
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-extrabold tracking-[-0.04em]">Математика</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Открытая школа</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
          {[...links, ...(user?.role === "admin" ? [{ href: "/admin/tasks", label: "Контент" }] : [])].map(link => {
            const active = location === link.href || (link.href === "/bank" && location.startsWith("/bank/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-950"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/workspace" className="hidden sm:block">
            <Button variant={isAuthenticated ? "secondary" : "default"} size="sm" disabled={loading} className="gap-2 rounded-lg font-bold">
              <UserRound className="h-4 w-4" />
              {isAuthenticated ? "Кабинет" : "Войти"}
            </Button>
          </Link>
          {!isAuthenticated && !loading ? (
            <Button onClick={startLogin} size="sm" className="hidden rounded-lg bg-[#e9c46a] font-extrabold text-[#0d2945] hover:bg-[#f0d68b] sm:inline-flex">
              Создать профиль
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className="md:hidden" asChild>
            <Link href="/bank" aria-label="Открыть задания"><Menu className="h-5 w-5" /></Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
