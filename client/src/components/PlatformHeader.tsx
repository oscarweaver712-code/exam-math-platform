import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { BookOpenCheck, Menu, Moon, Sun, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

const links = [
  { href: "/bank", label: "Банк" },
  { href: "/theory", label: "Теория" },
  { href: "/practice", label: "Практика" },
  { href: "/workspace", label: "Кабинет" },
];

export function PlatformHeader() {
  const { isAuthenticated, loading, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  return <header className="app-header sticky top-0 z-50 border-b border-white/10 bg-[#0b0b0d]/85 backdrop-blur-xl"><div className="container flex h-[74px] items-center justify-between gap-4"><Link href="/" className="group flex items-center gap-3 text-[#f7f2eb]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff5b14] shadow-[0_0_32px_rgba(255,91,20,.33)] transition-transform duration-200 group-hover:rotate-[-6deg] group-hover:scale-105"><BookOpenCheck className="h-5 w-5 text-[#101014]" strokeWidth={2.7} /></span><span className="leading-none"><span className="block font-['Space_Grotesk'] text-[15px] font-bold tracking-[-0.05em]">Школа 911</span><span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.22em] text-[#8e8b91]">ОГЭ · математика</span></span></Link><nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">{[...links, ...(user?.role === "admin" ? [{ href: "/admin/tasks", label: "Контент" }] : [])].map(link => { const active = location === link.href || (link.href === "/bank" && location.startsWith("/bank/")); return <Link key={link.href} href={link.href} className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${active ? "bg-[#ff5b14] text-[#101014]" : "text-[#a7a4aa] hover:bg-white/8 hover:text-white"}`}>{link.label}</Link>; })}</nav><div className="flex items-center gap-2"><Button onClick={toggleTheme} variant="ghost" size="icon" className="rounded-lg text-[#f5f0e9] hover:bg-white/10 hover:text-white" aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Link href="/workspace" className="hidden sm:block"><Button variant="secondary" size="sm" disabled={loading} className="gap-2 rounded-lg border border-white/12 bg-white/6 font-bold text-[#f5f0e9] hover:bg-white/10"><UserRound className="h-4 w-4" />{isAuthenticated ? "Кабинет" : "Войти"}</Button></Link>{!isAuthenticated && !loading ? <Button onClick={startLogin} size="sm" className="hidden rounded-lg bg-[#ff5b14] font-extrabold text-[#111113] hover:bg-[#ff7a35] sm:inline-flex">Начать</Button> : null}<Button variant="ghost" size="icon" className="text-[#f5f0e9] hover:bg-white/10 hover:text-white md:hidden" asChild><Link href="/bank" aria-label="Открыть задания"><Menu className="h-5 w-5" /></Link></Button></div></div></header>;
}
