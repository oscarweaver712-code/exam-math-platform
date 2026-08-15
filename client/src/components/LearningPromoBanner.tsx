import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RadioTower, X } from "lucide-react";
import { useState } from "react";

export function LearningPromoBanner() {
  const promo = trpc.publicBank.activePromo.useQuery({ placement: "theory" });
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  if (!promo.data || dismissedId === promo.data.id) return null;
  return <section className="border-b border-[#ff5b14]/30 bg-[#ff5b14]/10"><div className="container flex items-center gap-3 py-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ff5b14] text-[#101014]"><RadioTower className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#ff8b4b]">{promo.data.eyebrow}</p><p className="truncate text-sm font-bold text-[#f5f0e9]">{promo.data.title}<span className="hidden font-medium text-[#c7c3ca] sm:inline"> · {promo.data.description}</span></p></div><a href={promo.data.ctaUrl} target={promo.data.ctaUrl.startsWith("http") ? "_blank" : undefined} rel={promo.data.ctaUrl.startsWith("http") ? "noreferrer" : undefined}><Button size="sm" className="h-8 shrink-0 rounded-lg bg-[#ff5b14] text-xs font-extrabold text-[#101014] hover:bg-[#ff7a35]">{promo.data.ctaLabel}</Button></a><button type="button" onClick={() => setDismissedId(promo.data!.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#ff8b4b] hover:bg-[#ff5b14]/12 hover:text-[#ffb187]" aria-label="Закрыть объявление"><X className="h-4 w-4" /></button></div></section>;
}
