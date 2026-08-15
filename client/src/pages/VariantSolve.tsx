import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";

export default function VariantSolve() {
  const [, published] = useRoute("/variants/:slug/solve"); const [, session] = useRoute("/variants/session/:entropy/solve");
  const variant = trpc.publicBank.getVariant.useQuery({ slug: published?.slug ?? "" }, { enabled: !!published?.slug });
  const generated = trpc.publicBank.generateSessionVariant.useQuery({ entropy: session?.entropy ?? "session" }, { enabled: !!session?.entropy });
  const items = published ? variant.data?.items.map(item => ({ ...item, id: item.taskId })) : generated.data;
  const [index, setIndex] = useState(0); const [answer, setAnswer] = useState(""); const check = trpc.publicBank.checkAnswer.useMutation();
  const current = items?.[index];
  const switchTo = (next: number) => { setIndex(next); setAnswer(""); check.reset(); };
  if ((!published && !session) || (!items && (variant.isLoading || generated.isLoading))) return <div className="theme-page grid min-h-screen place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#ff5b14]" /></div>;
  if (!current) return <div className="theme-page min-h-screen"><PlatformHeader /><main className="container py-16">Вариант не найден.</main></div>;
  return <div className="theme-page min-h-screen"><PlatformHeader /><main className="container py-8"><div className="mb-5 flex flex-wrap gap-2">{items?.map((item, itemIndex) => <button key={`${item.id}-${itemIndex}`} onClick={() => switchTo(itemIndex)} className={`h-9 w-9 rounded-lg text-sm font-bold ${itemIndex === index ? "bg-[#ff5b14] text-[#101014]" : "bg-white/6 text-[#aaa7ae] hover:bg-white/10"}`}>{item.sortOrder}</button>)}</div><section className="theme-surface rounded-[28px] border p-6 sm:p-9"><div className="flex flex-wrap items-center gap-2"><Badge className="border-0 bg-[#ff5b14]/14 text-[#ff8b4b]">Вариант · позиция {current.sortOrder}/25</Badge><Badge variant="outline" className="border-white/12 text-[#aaa7ae]">КИМ № {current.kimNumber}</Badge><Badge variant="outline" className="border-white/12 text-[#aaa7ae]">{current.part === "part1" ? "Часть 1" : "Часть 2"}</Badge></div><h1 className="mt-5 text-2xl font-bold sm:text-3xl">{current.title}</h1><p className="mt-6 whitespace-pre-wrap text-base leading-8">{current.statementMarkdown}</p><div className="mt-8 border-t border-white/10 pt-6">{current.answerKind === "manual" ? <p className="theme-muted text-sm">Запишите развёрнутое решение. Автоматическая проверка для этой позиции не выполняется.</p> : <div className="flex flex-wrap gap-2"><Input value={answer} onChange={event => setAnswer(event.target.value)} className="max-w-xs" placeholder="Ваш ответ" /><Button onClick={() => check.mutate({ taskId: current.id, rawAnswer: answer })} disabled={!answer || check.isPending} className="bg-[#ff5b14] text-[#101014] hover:bg-[#ff7a35]"><Check className="mr-2 h-4 w-4" />Проверить</Button></div>}{check.data ? <p className={`mt-3 text-sm font-bold ${check.data.isCorrect ? "text-emerald-300" : "text-rose-300"}`}>{check.data.feedback}</p> : null}<Link href={`/bank/${current.slug}`} className="mt-4 inline-block text-sm font-bold text-[#ff8b4b]">Открыть подсказки и разбор этой задачи</Link></div></section><div className="mt-5 flex justify-between"><Button variant="outline" disabled={index === 0} onClick={() => switchTo(index - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Предыдущее</Button><Button disabled={index === 24} onClick={() => switchTo(index + 1)} className="bg-[#ff5b14] text-[#101014]"><ArrowRight className="mr-2 h-4 w-4" />Следующее</Button></div></main></div>;
}
