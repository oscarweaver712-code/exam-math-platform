import { useAuth } from "@/_core/hooks/useAuth";
import { PlatformHeader } from "@/components/PlatformHeader";
import { ContentOrigin } from "@/components/ContentOrigin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, Check, Eye, FilePlus2, Layers3, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type Status = "draft" | "review" | "published" | "archived";
type SourceKind = "author" | "licensed" | "external_reference";
type Sections = { rule: string; formula: string; algorithm: string; mistake: string; practice: string };

const emptySections: Sections = { rule: "", formula: "", algorithm: "", mistake: "", practice: "" };
const panel = "theme-surface rounded-[24px] border p-5 sm:p-6";
const orangeButton = "rounded-xl bg-[#ff5b14] font-extrabold text-[#101014] hover:bg-[#ff7a35]";
const statusLabels: Record<Status, string> = { draft: "Черновик", review: "На проверке", published: "Опубликован", archived: "В архиве" };
const sourceLabels: Record<SourceKind, string> = { author: "Авторский материал Школы 911", licensed: "Лицензированный материал", external_reference: "Внешний ориентир / ссылка" };

function slugify(value: string) {
  const transliteration: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return value.toLowerCase().trim().split("").map(char => transliteration[char] ?? char).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "new-theory";
}

function readSection(markdown: string, heading: string) {
  return markdown.match(new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n\\n## |$)`))?.[1]?.trim() ?? "";
}

function parseSections(markdown: string): Sections {
  return {
    rule: readSection(markdown, "Правило"),
    formula: readSection(markdown, "Формула") || readSection(markdown, "Формулы"),
    algorithm: readSection(markdown, "Алгоритм"),
    mistake: readSection(markdown, "Типичная ошибка"),
    practice: readSection(markdown, "Практика"),
  };
}

function composeSections(sections: Sections) {
  return [
    ["Правило", sections.rule],
    ["Формула", sections.formula],
    ["Алгоритм", sections.algorithm],
    ["Типичная ошибка", sections.mistake],
    ["Практика", sections.practice],
  ].filter(([, body]) => body.trim()).map(([heading, body]) => `## ${heading}\n\n${body.trim()}`).join("\n\n");
}

function TheoryPreview({ title, lead, sections }: { title: string; lead: string; sections: Sections }) {
  const blocks = [["Правило", sections.rule], ["Формула", sections.formula], ["Алгоритм", sections.algorithm], ["Типичная ошибка", sections.mistake], ["Практика", sections.practice]].filter(([, value]) => value.trim());
  return <div className="rounded-2xl border border-white/10 bg-[#101012] p-5"><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.14em] text-[#ff8b4b]"><Eye className="h-4 w-4" /> Предпросмотр ученика</div><div className="mt-4"><ContentOrigin kind="author" compact /></div><h3 className="mt-4 text-2xl font-bold tracking-[-.04em]">{title || "Название конспекта"}</h3><p className="mt-2 text-sm leading-6 text-[#aaa7ae]">{lead || "Короткое объяснение появится здесь."}</p><div className="mt-5 space-y-4 border-t border-white/8 pt-5">{blocks.length ? blocks.map(([heading, body]) => <section key={heading as string}><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">{heading}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#d3cec7]">{body}</p></section>) : <p className="text-sm text-[#89868d]">Заполните структурные поля, чтобы увидеть будущий конспект.</p>}</div></div>;
}

export default function AdminTheory() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const options = trpc.school.admin.options.useQuery(undefined, { enabled: isAdmin });
  const list = trpc.school.admin.theory.useQuery(undefined, { enabled: isAdmin });
  const taskList = trpc.school.admin.tasks.useQuery(undefined, { enabled: isAdmin });
  const [editId, setEditId] = useState<number | null>(null);
  const selected = trpc.school.admin.getTheory.useQuery({ theoryUnitId: editId ?? 0 }, { enabled: isAdmin && Boolean(editId) });
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [lead, setLead] = useState("");
  const [topic, setTopic] = useState("");
  const [kim, setKim] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [sourceKind, setSourceKind] = useState<SourceKind>("author");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [relatedTaskIds, setRelatedTaskIds] = useState<number[]>([]);
  const [sections, setSections] = useState<Sections>(emptySections);
  const defaultTopic = useMemo(() => options.data?.topics[0]?.slug ?? "", [options.data]);
  const defaultKim = useMemo(() => options.data?.taskTypes[0]?.kimNumber ?? "", [options.data]);
  const bodyMarkdown = useMemo(() => composeSections(sections), [sections]);

  const reset = () => { setEditId(null); setTitle(""); setSlug(""); setLead(""); setTopic(""); setKim(""); setStatus("draft"); setSourceKind("author"); setSourceTitle(""); setSourceUrl(""); setRelatedTaskIds([]); setSections(emptySections); };
  useEffect(() => {
    if (!selected.data) return;
    setTitle(selected.data.title); setSlug(selected.data.slug); setLead(selected.data.lead); setTopic(selected.data.topicSlug); setKim(selected.data.kimNumber); setStatus(selected.data.status); setSourceKind(selected.data.sourceKind); setSourceTitle(selected.data.sourceTitle ?? ""); setSourceUrl(selected.data.sourceUrl ?? ""); setRelatedTaskIds(selected.data.relatedTaskIds); setSections(parseSections(selected.data.bodyMarkdown));
  }, [selected.data]);
  const refresh = (message: string) => { list.refetch(); toast.success(message); reset(); };
  const create = trpc.school.admin.createTheory.useMutation({ onSuccess: () => refresh("Конспект создан в редакционном слое"), onError: error => toast.error(error.message) });
  const update = trpc.school.admin.updateTheory.useMutation({ onSuccess: () => refresh("Изменения конспекта сохранены"), onError: error => toast.error(error.message) });
  const pending = create.isPending || update.isPending;
  const toggleTask = (taskId: number) => setRelatedTaskIds(current => current.includes(taskId) ? current.filter(id => id !== taskId) : [...current, taskId]);
  const setSection = (key: keyof Sections, value: string) => setSections(current => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (bodyMarkdown.length < 80) return toast.error("Заполните минимум два смысловых блока конспекта.");
    const payload = { title, slug: slug || slugify(title), lead, bodyMarkdown, topicSlug: topic || defaultTopic, kimNumber: kim || defaultKim, relatedTaskIds, sourceKind, sourceTitle: sourceKind === "author" ? undefined : sourceTitle || undefined, sourceUrl: sourceKind === "author" ? undefined : sourceUrl || undefined, status };
    if (editId) update.mutate({ ...payload, theoryUnitId: editId }); else create.mutate(payload);
  };

  if (!loading && !isAdmin) return <div className="theme-page min-h-screen"><PlatformHeader /><main className="container py-16"><section className="mx-auto max-w-2xl rounded-[28px] border border-[#ff5b14]/35 bg-[#ff5b14]/8 p-8"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Нет доступа</p><h1 className="mt-4 text-3xl font-bold">Редактор конспектов доступен администратору.</h1><p className="theme-muted mt-4 leading-7">Публикация теории и указание происхождения материалов отделены от личного кабинета ученика.</p></section></main></div>;
  return <div className="theme-page min-h-screen"><PlatformHeader /><main className="container py-10 sm:py-14"><section className="theme-surface relative overflow-hidden rounded-[28px] border p-6 sm:p-8"><div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#ff5b14]/15 blur-3xl" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#ff7a35]">Контентный слой / теория</p><h1 className="mt-4 text-4xl font-bold tracking-[-.055em] sm:text-5xl">Редактор конспектов</h1><p className="theme-muted mt-4 max-w-2xl text-sm leading-6">Собирайте учебный материал из понятных блоков, привязывайте его к теме и КИМ, указывайте происхождение и выбирайте практику для закрепления.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/tasks"><Button variant="outline" className="rounded-xl border-white/12 bg-white/5 font-bold text-[#f5f0e9] hover:bg-white/10 hover:text-white"><Layers3 className="mr-2 h-4 w-4" /> Редактор задач</Button></Link><div className="hidden items-center gap-2 rounded-xl border border-[#ff5b14]/30 bg-[#ff5b14]/10 px-4 py-3 text-sm font-bold text-[#ff8b4b] sm:flex"><ShieldCheck className="h-4 w-4" /> Редакционная зона</div></div></div></section><div className="mt-7 grid gap-5 xl:grid-cols-[1.14fr_.86fr]"><section className={panel}><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff5b14] text-[#101014]"><FilePlus2 className="h-4 w-4" /></span><h2 className="text-lg font-bold">{editId ? "Редактирование конспекта" : "Новый конспект"}</h2></div>{editId ? <Button type="button" variant="ghost" size="sm" onClick={reset} className="gap-2 text-[#ff8b4b] hover:bg-[#ff5b14]/10 hover:text-[#ff9a61]"><Plus className="h-4 w-4" /> Новый</Button> : null}</div>{selected.isLoading ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#ff5b14]" /></div> : <form className="mt-6 space-y-5" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="theory-title" className="theme-muted">Название</Label><Input id="theory-title" value={title} onChange={event => setTitle(event.target.value)} required className="mt-2 h-10" /></div><div><Label htmlFor="theory-slug" className="theme-muted">URL-идентификатор</Label><Input id="theory-slug" value={slug} onChange={event => setSlug(event.target.value)} placeholder="quadratic-equations" className="mt-2 h-10" /></div></div><div><Label htmlFor="theory-lead" className="theme-muted">Короткое объяснение</Label><Textarea id="theory-lead" value={lead} onChange={event => setLead(event.target.value)} required className="mt-2 min-h-20" /></div><div className="grid gap-4 sm:grid-cols-3"><div><Label className="theme-muted">Тема</Label><select value={topic || defaultTopic} onChange={event => setTopic(event.target.value)} className="mt-2 flex h-10 w-full rounded-lg px-3 text-sm">{options.data?.topics.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></div><div><Label className="theme-muted">Номер КИМ</Label><select value={kim || defaultKim} onChange={event => setKim(event.target.value)} className="mt-2 flex h-10 w-full rounded-lg px-3 text-sm">{options.data?.taskTypes.map(item => <option key={item.kimNumber} value={item.kimNumber}>{item.kimNumber} · {item.title}</option>)}</select></div><div><Label className="theme-muted">Статус</Label><select value={status} onChange={event => setStatus(event.target.value as Status)} className="mt-2 flex h-10 w-full rounded-lg px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="rounded-2xl border border-[#ff5b14]/20 bg-[#ff5b14]/6 p-4"><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#ff7a35]" /><p className="text-sm font-bold">Структура конспекта</p></div><p className="theme-muted mt-2 text-xs leading-5">Поля сразу превращаются в понятный конспект для ученика: без ручной вёрстки и потери единого формата.</p><div className="mt-4 grid gap-4"><div><Label className="theme-muted">Правило</Label><Textarea value={sections.rule} onChange={event => setSection("rule", event.target.value)} placeholder="Основное утверждение или приём." className="mt-2 min-h-20" /></div><div><Label className="theme-muted">Формула</Label><Textarea value={sections.formula} onChange={event => setSection("formula", event.target.value)} placeholder="Например: S = v × t" className="mt-2 min-h-18" /></div><div><Label className="theme-muted">Алгоритм</Label><Textarea value={sections.algorithm} onChange={event => setSection("algorithm", event.target.value)} placeholder="1. ...\n2. ..." className="mt-2 min-h-24" /></div><div><Label className="theme-muted">Типичная ошибка</Label><Textarea value={sections.mistake} onChange={event => setSection("mistake", event.target.value)} placeholder="Что проверить до ответа." className="mt-2 min-h-20" /></div><div><Label className="theme-muted">Закрепление практикой</Label><Textarea value={sections.practice} onChange={event => setSection("practice", event.target.value)} placeholder="Какие действия и типы задач отработать." className="mt-2 min-h-20" /></div></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label className="theme-muted">Происхождение</Label><select value={sourceKind} onChange={event => setSourceKind(event.target.value as SourceKind)} className="mt-2 flex h-10 w-full rounded-lg px-3 text-sm">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label className="theme-muted">Метка источника</Label><Input value={sourceKind === "author" ? "Авторский материал Школы 911" : sourceTitle} onChange={event => setSourceTitle(event.target.value)} disabled={sourceKind === "author"} placeholder="Название правообладателя или документа" className="mt-2 h-10" /></div></div>{sourceKind !== "author" ? <div><Label className="theme-muted">Ссылка на источник или лицензию</Label><Input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} type="url" placeholder="https://..." className="mt-2 h-10" required /></div> : null}<div><div className="flex items-center justify-between gap-3"><Label className="theme-muted">Связанная практика</Label><span className="text-xs font-bold text-[#ff8b4b]">Выбрано: {relatedTaskIds.length}</span></div><div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-[#101012] p-3">{taskList.data?.map(task => <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent bg-white/4 p-3 text-sm transition hover:border-white/10 hover:bg-white/6"><input type="checkbox" checked={relatedTaskIds.includes(task.id)} onChange={() => toggleTask(task.id)} className="mt-0.5 h-4 w-4 accent-[#ff5b14]" /><span><span className="font-extrabold text-[#e9e4de]">{task.title}</span><span className="mt-1 block text-xs text-[#89868d]">КИМ {task.kimNumber} · {task.topicTitle}</span></span></label>)}</div></div><Button type="submit" disabled={pending || options.isLoading} className={orangeButton}>{editId ? "Сохранить изменения" : status === "published" ? "Опубликовать конспект" : "Сохранить в черновики"}</Button></form>}</section><aside className="space-y-5"><TheoryPreview title={title} lead={lead} sections={sections} /><section className={panel}><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Библиотека теории</h2><p className="theme-muted mt-2 text-sm">Откройте материал, чтобы продолжить работу.</p></div><span className="font-['Space_Grotesk'] text-lg font-bold text-[#ff7a35]">{list.data?.length ?? 0}</span></div><div className="mt-5 max-h-[680px] space-y-2 overflow-y-auto pr-1">{list.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#ff5b14]" /></div> : list.data?.map(item => <button type="button" key={item.id} onClick={() => setEditId(item.id)} className={`w-full rounded-xl border p-4 text-left transition ${editId === item.id ? "border-[#ff5b14]/65 bg-[#ff5b14]/8" : "border-white/8 bg-[#101012] hover:border-white/20 hover:bg-[#1a1a1e]"}`}><div className="flex flex-wrap gap-2"><Badge className="border-0 bg-[#ff5b14]/14 text-[#ff8b4b] hover:bg-[#ff5b14]/14">КИМ {item.kimNumber}</Badge><Badge variant="outline" className="border-white/12 text-[#b7b3ba]">{item.topicTitle}</Badge><Badge variant="outline" className={item.status === "published" ? "border-emerald-400/25 text-emerald-300" : item.status === "review" ? "border-[#ff5b14]/30 text-[#ff8b4b]" : "border-white/12 text-[#89868d]"}>{statusLabels[item.status]}</Badge></div><div className="mt-3 flex items-center justify-between gap-3"><div><p className="font-extrabold text-[#f5f0e9]">{item.title}</p><p className="mt-1 text-xs text-[#89868d]">/{item.slug} · {sourceLabels[item.sourceKind]}</p></div><Pencil className="h-4 w-4 text-[#ff7a35]" /></div></button>)}</div></section></aside></div></main></div>;
}
