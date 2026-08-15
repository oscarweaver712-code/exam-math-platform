import { useAuth } from "@/_core/hooks/useAuth";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FilePlus2, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "new-task";
}

type Status = "draft" | "review" | "published";
type Difficulty = "basic" | "standard" | "advanced";
type AnswerKind = "short_integer" | "short_decimal" | "short_text" | "manual";

export default function AdminTasks() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const options = trpc.school.admin.options.useQuery(undefined, { enabled: isAdmin });
  const tasks = trpc.school.admin.tasks.useQuery(undefined, { enabled: isAdmin });
  const [editId, setEditId] = useState<number | null>(null);
  const selectedTask = trpc.school.admin.getTask.useQuery({ taskId: editId ?? 0 }, { enabled: isAdmin && Boolean(editId) });
  const defaultTopic = useMemo(() => options.data?.topics[0]?.slug ?? "", [options.data]);
  const defaultKim = useMemo(() => options.data?.taskTypes[0]?.kimNumber ?? "", [options.data]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [statement, setStatement] = useState("");
  const [solution, setSolution] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [topic, setTopic] = useState("");
  const [kim, setKim] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [answerKind, setAnswerKind] = useState<AnswerKind>("short_integer");

  const clearForm = () => {
    setEditId(null); setTitle(""); setSlug(""); setStatement(""); setSolution(""); setCorrectAnswer(""); setTopic(""); setKim(""); setStatus("draft"); setDifficulty("standard"); setAnswerKind("short_integer");
  };

  useEffect(() => {
    if (!selectedTask.data) return;
    setTitle(selectedTask.data.title);
    setSlug(selectedTask.data.slug);
    setStatement(selectedTask.data.statementMarkdown);
    setSolution(selectedTask.data.solutionMarkdown);
    setCorrectAnswer(selectedTask.data.correctAnswer ?? "");
    setTopic(selectedTask.data.topicSlug ?? "");
    setKim(selectedTask.data.kimNumber);
    setStatus(selectedTask.data.status === "archived" ? "draft" : selectedTask.data.status);
    setDifficulty(selectedTask.data.difficulty);
    setAnswerKind(selectedTask.data.answerKind);
  }, [selectedTask.data]);

  const refreshAfterSave = (message: string) => { tasks.refetch(); toast.success(message); clearForm(); };
  const createTask = trpc.school.admin.createTask.useMutation({ onSuccess: () => refreshAfterSave("Задача добавлена в контентный список") });
  const updateTask = trpc.school.admin.updateTask.useMutation({ onSuccess: () => refreshAfterSave("Изменения сохранены") });
  const pending = createTask.isPending || updateTask.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { title, slug: slug || slugify(title), statementMarkdown: statement, solutionMarkdown: solution, correctAnswer: answerKind === "manual" ? undefined : correctAnswer, answerKind, topicSlug: topic || defaultTopic, kimNumber: kim || defaultKim, difficulty, status };
    if (editId) updateTask.mutate({ ...payload, taskId: editId });
    else createTask.mutate(payload);
  };

  if (!loading && !isAdmin) return <div className="min-h-screen bg-[#f7f8f5]"><PlatformHeader /><main className="container py-16"><section className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-950"><h1 className="text-2xl font-extrabold">Нет доступа</h1><p className="mt-3">Этот раздел доступен администратору контента.</p></section></main></div>;

  return <div className="min-h-screen bg-[#f7f8f5]"><PlatformHeader /><main className="container py-9 sm:py-12"><div className="flex items-end justify-between gap-5"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2c668f]">Контентный слой</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-0.055em] text-slate-950">Редактор заданий</h1><p className="mt-3 text-sm leading-6 text-slate-600">Создавайте авторские задачи, проверяйте разметку и управляйте статусом публикации.</p></div><div className="hidden items-center gap-2 rounded-xl bg-[#e9f2f8] px-4 py-3 text-sm font-bold text-[#245d87] sm:flex"><ShieldCheck className="h-4 w-4" /> Редакторская зона</div></div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><FilePlus2 className="h-5 w-5 text-[#b88318]" /><h2 className="text-lg font-extrabold text-slate-950">{editId ? "Редактирование задачи" : "Новая задача"}</h2></div>{editId ? <Button type="button" variant="ghost" size="sm" onClick={clearForm} className="gap-2 text-[#245d87]"><Plus className="h-4 w-4" /> Новая</Button> : null}</div>{selectedTask.isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2c668f]" /></div> : <form className="mt-5 space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="admin-title">Название</Label><Input id="admin-title" value={title} onChange={event => setTitle(event.target.value)} required /></div><div><Label htmlFor="admin-slug">URL-идентификатор</Label><Input id="admin-slug" value={slug} onChange={event => setSlug(event.target.value)} placeholder="skidka-20" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Тема</Label><select value={topic || defaultTopic} onChange={event => setTopic(event.target.value)} className="mt-2 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm">{options.data?.topics.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></div><div><Label>Номер КИМ</Label><select value={kim || defaultKim} onChange={event => setKim(event.target.value)} className="mt-2 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm">{options.data?.taskTypes.map(item => <option key={item.kimNumber} value={item.kimNumber}>{item.kimNumber} · {item.title}</option>)}</select></div></div><div className="grid gap-4 sm:grid-cols-3"><div><Label>Сложность</Label><select value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)} className="mt-2 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="basic">Базовый</option><option value="standard">Стандарт</option><option value="advanced">Повышенный</option></select></div><div><Label>Ответ</Label><select value={answerKind} onChange={event => setAnswerKind(event.target.value as AnswerKind)} className="mt-2 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="short_integer">Целое число</option><option value="short_decimal">Десятичное число</option><option value="short_text">Текст</option><option value="manual">Ручная проверка</option></select></div><div><Label>Статус</Label><select value={status} onChange={event => setStatus(event.target.value as Status)} className="mt-2 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="draft">Черновик</option><option value="review">На проверке</option><option value="published">Опубликовать</option></select></div></div><div><Label htmlFor="admin-statement">Условие</Label><Textarea id="admin-statement" value={statement} onChange={event => setStatement(event.target.value)} className="mt-2 min-h-28" required /></div>{answerKind !== "manual" ? <div><Label htmlFor="admin-answer">Правильный ответ для Части 1</Label><Input id="admin-answer" value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} required /></div> : null}<div><Label htmlFor="admin-solution">Разбор</Label><Textarea id="admin-solution" value={solution} onChange={event => setSolution(event.target.value)} className="mt-2 min-h-32" required /></div><Button type="submit" disabled={pending || options.isLoading} className="rounded-lg bg-[#0d2945] font-extrabold">{editId ? "Сохранить изменения" : status === "published" ? "Опубликовать" : "Сохранить в черновики"}</Button></form>}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-extrabold text-slate-950">Контентный список</h2><p className="mt-2 text-sm text-slate-600">Нажмите на запись, чтобы открыть её в редакторе.</p><div className="mt-5 max-h-[740px] space-y-2 overflow-y-auto pr-1">{tasks.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2c668f]" /></div> : tasks.data?.map(task => <button type="button" key={task.id} onClick={() => setEditId(task.id)} className={`w-full rounded-xl border p-4 text-left transition ${editId === task.id ? "border-[#2c668f] bg-[#f2f7fa]" : "border-slate-100 hover:border-[#c9ddeb] hover:bg-[#fbfdff]"}`}><div className="flex flex-wrap gap-2"><Badge className="bg-[#e9f2f8] text-[#225a82] hover:bg-[#e9f2f8]">КИМ {task.kimNumber}</Badge><Badge variant="outline">{task.topicTitle}</Badge><Badge variant="outline" className={task.status === "published" ? "border-emerald-200 text-emerald-700" : task.status === "review" ? "border-amber-200 text-amber-700" : ""}>{task.status === "published" ? "Опубликовано" : task.status === "review" ? "На проверке" : "Черновик"}</Badge></div><div className="mt-3 flex items-center justify-between gap-3"><div><p className="font-extrabold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">/{task.slug}</p></div><Pencil className="h-4 w-4 text-[#2c668f]" /></div></button>)}</div></section></div></main></div>;
}
