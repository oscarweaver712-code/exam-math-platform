import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

type EditorialAssignee = {
  userId: number;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "editor";
};

export function ImportAssignmentControl({
  assignedEditorUserId,
  assignedAt,
  assignees,
  onAssign,
  isPending,
}: {
  assignedEditorUserId: number | null;
  assignedAt: number | null;
  assignees: EditorialAssignee[];
  onAssign: (editorUserId: number) => void;
  isPending: boolean;
}) {
  const [editorUserId, setEditorUserId] = useState(assignedEditorUserId ? String(assignedEditorUserId) : "");

  useEffect(() => {
    setEditorUserId(assignedEditorUserId ? String(assignedEditorUserId) : "");
  }, [assignedEditorUserId]);

  const assigned = assignees.find(item => item.userId === assignedEditorUserId);

  return (
    <div className="mt-3 rounded-lg border border-white/8 bg-black/10 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#77747b]">Редактор проверки</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={editorUserId}
          onChange={event => setEditorUserId(event.target.value)}
          className="h-9 min-w-52 rounded-lg border border-white/12 bg-white/5 px-2 text-xs"
          aria-label="Назначить редактора"
        >
          <option value="">Выберите редактора…</option>
          {assignees.map(editor => (
            <option key={editor.userId} value={editor.userId}>
              {editor.name ?? editor.email ?? `Аккаунт #${editor.userId}`} · {editor.role}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={!editorUserId || isPending} onClick={() => onAssign(Number(editorUserId))}>
          {assignedEditorUserId ? "Переназначить" : "Назначить"}
        </Button>
      </div>
      {assigned ? <p className="theme-muted mt-2 text-xs">Сейчас назначен: {assigned.name ?? assigned.email ?? `Аккаунт #${assigned.userId}`}{assignedAt ? " · назначение сохранено" : ""}</p> : null}
    </div>
  );
}
