import { ExternalLink, FileCheck2, PenLine } from "lucide-react";

type ContentOriginProps = {
  kind: "author" | "licensed" | "external_reference";
  title?: string | null;
  url?: string | null;
  compact?: boolean;
};

const labels = {
  author: "Авторский материал Школы 911",
  licensed: "Лицензированный материал",
  external_reference: "Внешний источник",
} as const;

export function ContentOrigin({ kind, title, url, compact = false }: ContentOriginProps) {
  const Icon = kind === "author" ? PenLine : kind === "licensed" ? FileCheck2 : ExternalLink;
  const inferredLabel = kind === "external_reference" && url?.includes("fipi.ru")
    ? "Составлено на основе ФИПИ"
    : kind === "external_reference" && url?.toLowerCase().includes("reshuege.ru")
      ? "Источник: РешуЕГЭ / РешуОГЭ"
      : labels[kind];
  const label = title || inferredLabel;
  const classes = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${kind === "author" ? "border-[#ff5b14]/30 bg-[#ff5b14]/10 text-[#ff8b4b]" : "border-sky-400/25 bg-sky-400/10 text-sky-300"}`;
  const content = <><Icon className="h-3 w-3" /> <span>{compact ? labels[kind] : label}</span>{url ? <ExternalLink className="h-3 w-3" /> : null}</>;
  return url ? <a className={classes} href={url} target="_blank" rel="noreferrer">{content}</a> : <span className={classes}>{content}</span>;
}
