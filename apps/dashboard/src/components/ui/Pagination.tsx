import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PaginationProps {
  /** Current page (1-indexed). */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total items across all pages. */
  total: number;
  /** Display range for "X-Y of Z". */
  start: number;
  end: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Optional label like "rows" / "files" / "agents". Default "items". */
  itemLabel?: string;
}

/**
 * Compute a window of page numbers around the current page.
 * Always includes 1 and totalPages, with `…` separators.
 *
 * Examples (currentPage in bold):
 *   total=3                 → 1 **2** 3
 *   total=10, page=1        → **1** 2 3 … 10
 *   total=10, page=5        → 1 … 4 **5** 6 … 10
 *   total=10, page=10       → 1 … 8 9 **10**
 */
function buildPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const window: (number | '…')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) window.push('…');
  for (let p = left; p <= right; p++) window.push(p);
  if (right < total - 1) window.push('…');
  window.push(total);
  return window;
}

export function Pagination({
  page,
  totalPages,
  total,
  start,
  end,
  onPageChange,
  className,
  itemLabel = 'items',
}: PaginationProps) {
  if (total === 0) return null;

  const pages = buildPageWindow(page, totalPages);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 flex-wrap text-sm',
        className
      )}
    >
      <p className="text-muted-foreground">
        Showing <span className="text-foreground font-medium">{start}-{end}</span>{' '}
        of <span className="text-foreground font-medium">{total}</span> {itemLabel}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pages.map((p, idx) =>
            p === '…' ? (
              <span
                key={`ellipsis-${idx}`}
                className="inline-flex items-center justify-center w-8 h-8 text-muted-foreground/60"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                  p === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
