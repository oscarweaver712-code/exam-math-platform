import { BookOpenCheck, ChevronDown, ClipboardList, GraduationCap, LayoutDashboard, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

type NavigationItem = { href: string; label: string; icon: typeof LayoutDashboard };

function NavigationGroup({ title, items, location, defaultOpen = true }: { title: string; items: NavigationItem[]; location: string; defaultOpen?: boolean }) {
  const containsActive = items.some(item => location === item.href || location.startsWith(`${item.href}/`));
  const [open, setOpen] = useState(defaultOpen || containsActive);
  return <section className="border-b border-white/8 pb-2 last:border-0"><button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[.14em] text-[#77747b] hover:bg-white/5"><span>{title}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>{open ? <div className="mt-1 space-y-1">{items.map(item => { const active = location === item.href || location.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-[#ff5b14] text-[#101014]" : "theme-muted hover:bg-white/6 hover:text-[#f5f0e9]"}`}><item.icon className="h-4 w-4" />{item.label}</Link>; })}</div> : null}</section>;
}

export function CabinetSidebar({ learningRole, floating = false }: { learningRole?: "student" | "tutor"; floating?: boolean }) {
  const [location] = useLocation();
  const learning: NavigationItem[] = [{ href: "/workspace", label: "Обзор", icon: LayoutDashboard }, { href: "/bank", label: "Задания", icon: BookOpenCheck }, { href: "/variants", label: "Варианты", icon: ClipboardList }];
  const roleItems: NavigationItem[] = learningRole === "tutor" ? [{ href: "/tutor", label: "Преподаватель", icon: GraduationCap }] : [];
  const account: NavigationItem[] = [{ href: "/settings", label: "Настройки", icon: Settings }];
  return <aside className={`theme-surface self-start rounded-2xl border p-3 ${floating ? "lg:fixed lg:left-6 lg:top-24 lg:z-40 lg:w-[220px]" : "lg:sticky lg:top-24"}`}><div className="flex items-center gap-2 px-3 pb-3 pt-1"><UserRound className="h-4 w-4 text-[#ff7a35]" /><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Меню кабинета</p><span className="ml-auto text-[10px] font-bold text-[#ff8b4b] lg:hidden">Разделы</span></div><nav className="space-y-2" aria-label="Разделы личного кабинета"><NavigationGroup title="Учёба" items={learning} location={location} />{roleItems.length ? <NavigationGroup title="Роль" items={roleItems} location={location} /> : null}<NavigationGroup title="Аккаунт" items={account} location={location} defaultOpen={location.startsWith("/settings")} /></nav></aside>;
}
