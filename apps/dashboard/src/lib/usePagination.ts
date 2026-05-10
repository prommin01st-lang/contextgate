import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination hook.
 *
 * Slices `items` into the current page. Resets to page 1 whenever the
 * underlying list size changes (e.g. after a filter / search) so users
 * never end up stranded on an empty trailing page.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp page if the list shrinks below current page
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageSize,
    total,
    totalPages,
    pageItems,
    start,
    end,
    /** Jump to first page — call after applying a new search/filter. */
    reset: () => setPage(1),
  };
}
