import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, ClipboardList, Compass, FileCheck2, GraduationCap, Home, Image, Inbox, LayoutDashboard, Library, Menu, Moon, Settings, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

const primaryLinks = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/bank", label: "Задания", icon: BookOpenCheck },
  { href: "/variants", label: "Варианты", icon: ClipboardList },
  { href: "/subjects", label: "Направления", icon: Compass },
];

const adminLinks = [
  { href: "/admin/tasks/control", label: "Проверка задач", icon: SlidersHorizontal },
  { href: "/admin/tasks", label: "Материалы", icon: FileCheck2 },
  { href: "/admin/intake", label: "Импорт", icon: Inbox },
  { href: "/admin/theory", label: "Теория", icon: Library },
  { href: "/admin/promos", label: "Баннеры", icon: Image },
  { href: "/admin/access", label: "Доступы", icon: ShieldCheck },
];

function isActiveRoute(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

export function PlatformHeader() {
  const { isAuthenticated, loading, user } = useAuth();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated });
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);  const cabinetLinks = [
    { href: "/workspace", label: "Кабинет", icon: LayoutDashboard },
    ...(profile.data?.learningRole === "tutor" ? [{ href: "/tutor", label: "Репетитор", icon: GraduationCap }] : []),
    { href: "/settings", label: "Настройки", icon: Settings },
  ];
  const navigationGroups = [
    { title: "Основное", items: primaryLinks },
    { title: "Кабинет", items: cabinetLinks },
    ...(user?.role === "admin" ? [{ title: "Управление", items: adminLinks }] : []),
  ];

  return <header className="app-header sticky top-0 z-50 border-b border-white/10 bg-[#0b0b0d]/85 backdrop-blur-xl"><div className="container flex h-[74px] items-center justify-between gap-3"><Link href="/" className="group flex min-w-0 items-center gap-3 text-[#f7f2eb]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff5b14] shadow-[0_0_32px_rgba(255,91,20,.33)] transition-transform duration-200 group-hover:rotate-[-6deg] group-hover:scale-105"><BookOpenCheck className="h-5 w-5 text-[#101014]" strokeWidth={2.7} /></span><span className="leading-none"><span className="block font-['Space_Grotesk'] text-[15px] font-bold tracking-[-0.05em]">Школа 911</span><span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.22em] text-[#8e8b91]">ОГЭ · МАТЕМАТИКА</span></span></Link><div className="flex shrink-0 items-center gap-2"><Button onClick={toggleTheme} variant="ghost" size="icon" className="rounded-lg text-[#f5f0e9] hover:bg-white/10 hover:text-white" aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>{!isAuthenticated && !loading ? <Button onClick={startLogin} size="sm" className="hidden rounded-lg bg-[#ff5b14] font-extrabold text-[#111113] hover:bg-[#ff7a35] sm:inline-flex">Начать</Button> : null}<Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><Button type="button" variant="outline" className="inline-flex h-10 gap-1.5 rounded-lg border-white/12 bg-white/6 px-2.5 text-xs font-extrabold text-[#f5f0e9] hover:bg-white/10 hover:text-white" aria-label="Открыть меню разделов"><Menu className="h-4 w-4" /><span>Меню</span></Button></SheetTrigger><SheetContent side="left" className="w-[min(88vw,340px)] gap-0 border-white/10 bg-[#111113] p-0 text-[#f5f0e9]"><SheetHeader className="border-b border-white/8 px-6 py-5 pr-14 text-left"><SheetTitle className="flex items-center gap-2 text-[#f5f0e9]"><Menu className="h-4 w-4 text-[#ff7a35]" />Разделы школы</SheetTitle><SheetDescription className="text-[#9b989f]">Быстрый переход по доступным разделам.</SheetDescription></SheetHeader><nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="Мобильная навигация">{navigationGroups.map(group => <section key={group.title} className="border-b border-white/8 py-3 first:pt-0 last:border-0"><p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#77747b]">{group.title}</p><div className="space-y-1">{group.items.map(item => { const active = isActiveRoute(location, item.href); const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-[#ff5b14] text-[#101014]" : "text-[#c7c3ca] hover:bg-white/7 hover:text-white"}`}><Icon className="h-4 w-4" />{item.label}</Link>; })}</div></section>)}</nav></SheetContent></Sheet></div></div></header>;
}
