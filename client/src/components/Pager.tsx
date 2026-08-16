import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

/**
 * Page numbers to render, with `null` marking a gap.
 *
 * The bank runs to hundreds of pages under a loose filter, so the strip always
 * shows the first and last page plus a window around the current one — enough
 * to step, and enough to see where you are.
 */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const page = current + offset;
    if (page > 1 && page < total) pages.add(page);
  }
  // Keep the strip a constant width near the ends, so it does not jump about.
  if (current <= 3) [2, 3, 4].forEach(page => page < total && pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(page => page > 1 && pages.add(page));

  const ordered = Array.from(pages).sort((a, b) => a - b);
  const withGaps: (number | null)[] = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) withGaps.push(null);
    withGaps.push(page);
  });
  return withGaps;
}

export function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(page));

  // A filter change can move the current page under us; keep the box in step.
  useEffect(() => setDraft(String(page)), [page]);

  if (pageCount <= 1) return null;

  const go = (target: number) => onChange(Math.min(pageCount, Math.max(1, target)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = Number(draft.replace(/\s/g, ""));
    if (Number.isFinite(target) && target >= 1) go(Math.trunc(target));
    else setDraft(String(page));
  };

  return (
    <nav aria-label="Навигация по страницам" className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button
          variant="outline" size="icon" aria-label="Первая страница"
          disabled={page <= 1} onClick={() => go(1)}
          className="h-9 w-9 rounded-lg border-white/12"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline" size="icon" aria-label="Предыдущая страница"
          disabled={page <= 1} onClick={() => go(page - 1)}
          className="h-9 w-9 rounded-lg border-white/12"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pageWindow(page, pageCount).map((item, index) =>
          item === null ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-[#77747b]" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "default" : "outline"}
              onClick={() => go(item)}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Страница ${item}`}
              className={
                item === page
                  ? "h-9 min-w-9 rounded-lg bg-[#ff5b14] px-2.5 font-bold text-[#101014] hover:bg-[#ff7a35]"
                  : "h-9 min-w-9 rounded-lg border-white/12 px-2.5 font-bold"
              }
            >
              {item}
            </Button>
          ),
        )}

        <Button
          variant="outline" size="icon" aria-label="Следующая страница"
          disabled={page >= pageCount} onClick={() => go(page + 1)}
          className="h-9 w-9 rounded-lg border-white/12"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline" size="icon" aria-label="Последняя страница"
          disabled={page >= pageCount} onClick={() => go(pageCount)}
          className="h-9 w-9 rounded-lg border-white/12"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={submit} className="flex items-center justify-center gap-2 text-xs text-[#918e95]">
        <label htmlFor="pager-jump">Перейти к странице</label>
        <input
          id="pager-jump"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          // No reset on blur: clicking «Перейти» blurs the field first, so
          // resetting here would discard the number before submit reads it.
          inputMode="numeric"
          className="h-8 w-16 rounded-lg border border-white/12 bg-[#121215] px-2 text-center text-sm font-bold text-[#ece6de] outline-none focus:border-[#ff5b14]"
        />
        <span>из {pageCount}</span>
        <Button type="submit" variant="outline" className="h-8 rounded-lg border-white/12 px-3 text-xs font-bold">
          Перейти
        </Button>
      </form>
    </nav>
  );
}
