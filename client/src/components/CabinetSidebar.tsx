import { BookOpenCheck, ChevronDown, ChevronRight, ClipboardList, GraduationCap, LayoutDashboard, Menu, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type NavigationItem = { href: string; label: string; icon: typeof LayoutDashboard };

function NavigationGroup({ title, items, location, defaultOpen = true, onNavigate }: { title: string; items: NavigationItem[]; location: string; defaultOpen?: boolean; onNavigate?: () => void }) {
  const containsActive = items.some(item => location === item.href || location.startsWith(`${item.href}/`));
  const [open, setOpen] = useState(defaultOpen || containsActive);
  return <section className="border-b border-white/8 pb-2 last:border-0"><button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[.14em] text-[#77747b] hover:bg-white/5"><span>{title}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>{open ? <div className="mt-1 space-y-1">{items.map(item => { const active = location === item.href || location.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-[#ff5b14] text-[#101014]" : "theme-muted hover:bg-white/6 hover:text-[#f5f0e9]"}`}><item.icon className="h-4 w-4" />{item.label}</Link>; })}</div> : null}</section>;
}

function CabinetNavigation({ learningRole, onNavigate }: { learningRole?: "student" | "tutor"; onNavigate?: () => void }) {
  const [location] = useLocation();
  const learning: NavigationItem[] = [{ href: "/workspace", label: "Обзор", icon: LayoutDashboard }, { href: "/bank", label: "Задания", icon: BookOpenCheck }, { href: "/variants", label: "Варианты", icon: ClipboardList }];
  const roleItems: NavigationItem[] = learningRole === "tutor" ? [{ href: "/tutor", label: "Преподаватель", icon: GraduationCap }] : [];
  const account: NavigationItem[] = [{ href: "/settings", label: "Настройки", icon: Settings }];
  return <nav className="space-y-2" aria-label="Разделы личного кабинета"><NavigationGroup title="Учёба" items={learning} location={location} onNavigate={onNavigate} />{roleItems.length ? <NavigationGroup title="Роль" items={roleItems} location={location} onNavigate={onNavigate} /> : null}<NavigationGroup title="Аккаунт" items={account} location={location} defaultOpen={location.startsWith("/settings")} onNavigate={onNavigate} /></nav>;
}

export function CabinetSidebar({ learningRole, floating = false }: { learningRole?: "student" | "tutor"; floating?: boolean }) {
  return <aside className={`theme-surface hidden self-start rounded-2xl border p-3 lg:block ${floating ? "lg:fixed lg:left-6 lg:top-24 lg:z-40 lg:w-[220px]" : "lg:sticky lg:top-24"}`}><div className="flex items-center gap-2 px-3 pb-3 pt-1"><UserRound className="h-4 w-4 text-[#ff7a35]" /><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#77747b]">Меню кабинета</p></div><CabinetNavigation learningRole={learningRole} /></aside>;
}

export function MobileCabinetDrawer({ learningRole }: { learningRole?: "student" | "tutor" }) {
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button type="button" variant="outline" className="h-11 w-full justify-between rounded-xl border-white/12 bg-white/[.035] px-4 text-[#f5f0e9] hover:bg-white/[.08] hover:text-white"><span className="flex items-center gap-2"><Menu className="h-4 w-4 text-[#ff7a35]" /><span className="font-bold">Разделы кабинета</span></span><ChevronRight className="h-4 w-4 text-[#ff8b4b]" /></Button></SheetTrigger><SheetContent side="left" className="w-[min(88vw,340px)] gap-0 border-white/10 bg-[#111113] p-0 text-[#f5f0e9]"><SheetHeader className="border-b border-white/8 px-6 py-5 pr-14 text-left"><SheetTitle className="flex items-center gap-2 text-[#f5f0e9]"><UserRound className="h-4 w-4 text-[#ff7a35]" />Меню кабинета</SheetTitle><SheetDescription className="text-[#9b989f]">Выберите нужный раздел.</SheetDescription></SheetHeader><div className="overflow-y-auto px-4 py-4"><CabinetNavigation learningRole={learningRole} onNavigate={() => setOpen(false)} /></div></SheetContent></Sheet>;
}
