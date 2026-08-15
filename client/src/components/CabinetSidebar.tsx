import { BookOpenCheck, ClipboardList, GraduationCap, LayoutDashboard, Settings, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";

export function CabinetSidebar({ learningRole }: { learningRole?: "student" | "tutor" }) {
  const [location] = useLocation();
  const items = [
    { href: "/workspace", label: "Обзор", icon: LayoutDashboard },
    { href: "/bank", label: "Задания", icon: BookOpenCheck },
    { href: "/variants", label: "Варианты", icon: ClipboardList },
    ...(learningRole === "tutor" ? [{ href: "/tutor", label: "Преподаватель", icon: GraduationCap }] : []),
  ];
  return <aside className="theme-surface hidden self-start rounded-2xl border p-3 lg:sticky lg:top-24 lg:block"><p className="px-3 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Личный кабинет</p><nav className="space-y-1" aria-label="Разделы личного кабинета">{items.map(item => { const active = location === item.href || (item.href === "/bank" && location.startsWith("/bank")) || (item.href === "/variants" && location.startsWith("/variants")); return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-[#ff5b14] text-[#101014]" : "theme-muted hover:bg-white/6 hover:text-[#f5f0e9]"}`}><item.icon className="h-4 w-4" />{item.label}</Link>; })}</nav><div className="mt-3 border-t border-white/8 pt-3"><Link href="/settings" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${location === "/settings" ? "bg-[#ff5b14] text-[#101014]" : "theme-muted hover:bg-white/6 hover:text-[#f5f0e9]"}`}><Settings className="h-4 w-4" />Настройки</Link></div></aside>;
}
