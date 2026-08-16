import { useAuth } from "@/_core/hooks/useAuth";
import { CabinetSidebar } from "@/components/CabinetSidebar";
import { PlatformHeader } from "@/components/PlatformHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { CalendarDays, Check, ClipboardPlus, Copy, Loader2, MailPlus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const panel = "theme-surface rounded-[24px] border p-5 sm:p-6";
const orangeButton = "rounded-xl bg-[#ff5b14] font-extrabold text-[#101014] hover:bg-[#ff7a35]";

export default function TutorWorkspace() {
  const { isAuthenticated, loading } = useAuth();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated });
  const students = trpc.school.tutor.students.useQuery(undefined, { enabled: profile.data?.learningRole === "tutor" });
  const homework = trpc.school.tutor.homework.useQuery(undefined, { enabled: profile.data?.learningRole === "tutor" });
  const catalog = trpc.publicBank.listTasks.useQuery({ page: 1, pageSize: 24 });
  const createInvite = trpc.school.tutor.createInvite.useMutation({
    onSuccess: () => { students.refetch(); toast.success("Приглашение создано"); },
  });
  const createHomework = trpc.school.tutor.createHomework.useMutation({
    onSuccess: () => { homework.refetch(); toast.success("Домашняя работа назначена"); },
  });

  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [title, setTitle] = useState("Практика по ОГЭ");
  const [dueDate, setDueDate] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const activeStudents = useMemo(
    () => students.data?.filter(student => student.status === "active") ?? [],
    [students.data],
  );

  const toggleTask = (taskId: number) => setSelectedTasks(current => (
    current.includes(taskId) ? current.filter(id => id !== taskId) : [...current, taskId]
  ));
  const copyInvite = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success("Код приглашения скопирован");
  };

  if (!loading && !isAuthenticated) {
    return <div className="min-h-screen bg-[#0b0b0d] text-[#f5f0e9]"><PlatformHeader /><main className="container py-16"><section className="orange-glow mx-auto max-w-xl rounded-[28px] bg-[#151518] p-8 sm:p-10"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#ff7a35]">Рабочее пространство</p><h1 className="mt-4 text-5xl font-bold leading-[.94] tracking-[-.065em]">Репетитор<br /><span className="text-[#ff5b14]">держит маршрут.</span></h1><p className="mt-6 leading-7 text-[#aaa7ae]">Войдите, чтобы приглашать учеников и выдавать им точную практику из открытого банка.</p><Button onClick={startLogin} className={`mt-8 ${orangeButton}`}>Войти в кабинет</Button></section></main></div>;
  }

  if (loading || profile.isLoading) return <div className="min-h-screen bg-[#0b0b0d]"><PlatformHeader /><main className="container grid min-h-72 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#ff5b14]" /></main></div>;
  if (profile.data?.learningRole === "unselected") return <div className="min-h-screen bg-[#0b0b0d] text-[#f5f0e9]"><PlatformHeader /><main className="container py-16"><section className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-[#151518] p-8 sm:p-10"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Нужен первый шаг</p><h1 className="mt-4 text-4xl font-bold tracking-[-.055em]">Сначала выберите роль.</h1><p className="mt-4 max-w-lg leading-7 text-[#aaa7ae]">Кабинет репетитора откроется после выбора роли при первом входе.</p><Link href="/workspace"><Button className={`mt-7 ${orangeButton}`}>Перейти к выбору роли</Button></Link></section></main></div>;
  if (profile.data?.learningRole !== "tutor") return <div className="min-h-screen bg-[#0b0b0d] text-[#f5f0e9]"><PlatformHeader /><main className="container py-16"><section className="mx-auto max-w-2xl rounded-[28px] border border-[#ff5b14]/35 bg-[#ff5b14]/8 p-8"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#ff7a35]">Роль не совпадает</p><h1 className="mt-4 text-3xl font-bold">Кабинет доступен репетитору.</h1><p className="mt-4 leading-7 text-[#aaa7ae]">Сейчас выбран режим ученика. Изменение роли доступно администратору платформы.</p></section></main></div>;

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#f5f0e9]">
      <PlatformHeader />
      <main className="container py-10 sm:py-14 lg:pl-64">
        <div className="mb-7 lg:hidden"><CabinetSidebar learningRole="tutor" /></div>
        <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#151518] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#ff5b14]/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#ff7a35]">Рабочее пространство / математика ОГЭ</p><h1 className="mt-4 text-4xl font-bold tracking-[-.055em] sm:text-5xl">Кабинет репетитора</h1><p className="mt-4 max-w-xl text-sm leading-6 text-[#aaa7ae]">Соберите ученика, точку в маршруте и конкретные задания. Ничего лишнего.</p></div>
            <div className="rounded-xl border border-[#ff5b14]/30 bg-[#ff5b14]/10 px-4 py-3 text-sm font-bold text-[#ff8b4b]"><UsersRound className="mr-2 inline h-4 w-4" /> {activeStudents.length} активных учеников</div>
          </div>
        </section>

        <div className="mt-7 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
          <section className="space-y-5">
            <div className={panel}><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff5b14] text-[#101014]"><MailPlus className="h-4 w-4" /></span><h2 className="text-lg font-bold">Пригласить ученика</h2></div><p className="mt-3 text-sm leading-6 text-[#aaa7ae]">Ученик сначала входит в систему и выбирает роль «Ученик».</p><form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createInvite.mutate({ studentEmail: email }); }}><Label htmlFor="student-email" className="text-[#c7c3ca]">Почта ученика</Label><Input id="student-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="student@example.com" required className="h-11" /><Button type="submit" disabled={createInvite.isPending} className={`w-full ${orangeButton}`}>Создать код приглашения</Button></form></div>
            <div className={panel}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Ученики</h2><span className="font-['Space_Grotesk'] text-lg font-bold text-[#ff7a35]">{students.data?.length ?? 0}</span></div><div className="mt-4 space-y-2">{students.data?.length ? students.data.map(student => <div key={student.linkId} className="rounded-xl border border-white/8 bg-[#101012] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold text-[#f5f0e9]">{student.studentName || student.studentEmail}</p><p className="mt-1 text-xs text-[#89868d]">{student.status === "active" ? "Подключён к предмету" : "Ожидает активации"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${student.status === "active" ? "bg-emerald-400/12 text-emerald-300" : "bg-[#ff5b14]/12 text-[#ff8b4b]"}`}>{student.status === "active" ? "Активен" : "Ожидает"}</span></div>{student.status === "pending" ? <button type="button" onClick={() => copyInvite(student.inviteCode)} className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-[#ff8b4b]">Код {student.inviteCode} <Copy className="h-3.5 w-3.5" /></button> : null}</div>) : <p className="rounded-xl border border-dashed border-white/12 bg-[#101012] p-4 text-sm leading-6 text-[#9b989f]">Создайте первое приглашение, чтобы подключить ученика к математике.</p>}</div></div>
          </section>
          <section className={panel}>
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff5b14] text-[#101014]"><ClipboardPlus className="h-4 w-4" /></span><h2 className="text-lg font-bold">Новое домашнее задание</h2></div>
            <p className="mt-3 text-sm leading-6 text-[#aaa7ae]">Выберите ученика, срок и несколько задач из банка ОГЭ.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3"><div><Label htmlFor="homework-title" className="text-[#c7c3ca]">Название</Label><Input id="homework-title" value={title} onChange={event => setTitle(event.target.value)} className="mt-2 h-10" /></div><div><Label htmlFor="homework-student" className="text-[#c7c3ca]">Ученик</Label><select id="homework-student" value={studentId ?? ""} onChange={event => setStudentId(event.target.value ? Number(event.target.value) : null)} className="mt-2 flex h-10 w-full rounded-lg px-3 text-sm"><option value="">Выберите ученика</option>{activeStudents.map(student => <option key={student.studentId} value={student.studentId}>{student.studentName || student.studentEmail}</option>)}</select></div><div><Label htmlFor="homework-deadline" className="text-[#c7c3ca]">Срок сдачи</Label><Input id="homework-deadline" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="mt-2 h-10" /></div></div>
            <div className="mt-6"><div className="flex items-center justify-between"><Label className="text-[#c7c3ca]">Задания</Label><span className="text-xs font-bold text-[#89868d]">Выбрано: {selectedTasks.length}</span></div><div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-[#101012] p-3">{catalog.data?.items.map(task => <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent bg-white/4 p-3 text-sm transition hover:border-white/10 hover:bg-white/6"><input type="checkbox" checked={selectedTasks.includes(task.id)} onChange={() => toggleTask(task.id)} className="mt-0.5 h-4 w-4 accent-[#ff5b14]" /><span><span className="font-extrabold text-[#e9e4de]">{task.taskType}</span><span className="mt-1 block text-xs leading-5 text-[#89868d]">КИМ {task.kimNumber} · {task.topicTitle}</span></span></label>)}</div></div>
            <Button onClick={() => { if (!studentId) return toast.error("Выберите ученика"); if (!selectedTasks.length) return toast.error("Выберите хотя бы одно задание"); createHomework.mutate({ studentUserId: studentId, title, taskIds: selectedTasks, dueAt: dueDate ? new Date(`${dueDate}T23:59:00`).getTime() : undefined }); }} disabled={createHomework.isPending} className={`mt-5 w-full ${orangeButton}`}>Назначить домашнюю работу</Button>
            <div className="mt-8 border-t border-white/8 pt-5"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#ff7a35]" /><h3 className="font-bold">Последние назначения</h3></div><div className="mt-3 space-y-2">{homework.data?.length ? homework.data.slice(0, 4).map(item => <div key={item.id} className="flex justify-between gap-3 rounded-lg border border-white/8 bg-[#101012] p-3 text-sm"><span><span className="block font-bold text-[#e6e1da]">{item.title}</span><span className="text-xs text-[#89868d]">{item.studentName || "Ученик"}{item.dueAt ? ` · до ${new Date(item.dueAt).toLocaleDateString("ru-RU")}` : " · без срока"}</span></span><Check className="h-4 w-4 text-emerald-400" /></div>) : <p className="text-sm text-[#89868d]">Назначений пока нет.</p>}</div></div>
          </section>
        </div>
      </main>
    </div>
  );
}
