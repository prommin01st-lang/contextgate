import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Folder, Database, BookOpen, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { SearchInput } from '../components/ui/SearchInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/Select';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { useWorkspaceStore } from '../stores/workspaceStore';

interface ResourceItem {
  uri: string;
  name: string;
  mimeType: string | null;
  connectorId: string;
  connectorName: string;
  connectorType: string;
}

interface ResourcesResponse {
  data: {
    total: number;
    items: ResourceItem[];
    errors: Array<{ connectorId: string; connectorName: string; error: string }>;
  };
}

const TYPE_ICON: Record<string, typeof FileText> = {
  filesystem: Folder,
  postgres: Database,
  notion: BookOpen,
};

export function Resources() {
  const { selectedWorkspaceId } = useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [connectorFilter, setConnectorFilter] = useState<string>('all');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['resources', selectedWorkspaceId],
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (selectedWorkspaceId) searchParams.workspaceId = selectedWorkspaceId;
      const res = await api
        .get('api/resources', { searchParams })
        .json<ResourcesResponse>();
      return res.data;
    },
  });

  // Build connector list for filter
  const connectorOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, { id: string; name: string }>();
    for (const item of data.items) {
      if (!seen.has(item.connectorId)) {
        seen.set(item.connectorId, { id: item.connectorId, name: item.connectorName });
      }
    }
    return Array.from(seen.values());
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.uri.toLowerCase().includes(search.toLowerCase());
      const matchesConnector =
        connectorFilter === 'all' || item.connectorId === connectorFilter;
      return matchesSearch && matchesConnector;
    });
  }, [data, search, connectorFilter]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(filtered, 25);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, connectorFilter]);

  // Group by connector — only the items on the current page
  const groupedByConnector = useMemo(() => {
    const groups = new Map<string, { name: string; type: string; items: ResourceItem[] }>();
    for (const item of pageItems) {
      const existing = groups.get(item.connectorId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.connectorId, {
          name: item.connectorName,
          type: item.connectorType,
          items: [item],
        });
      }
    }
    return groups;
  }, [pageItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Resources
          </h1>
          <p className="text-muted-foreground mt-2">
            Files, tables, and pages discovered across all your connectors.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {data && (
            <span>
              {total} of {data.total} resources
              {isFetching && ' · refreshing…'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or URI…"
          className="max-w-sm flex-1"
        />
        <div className="w-56">
          <Select value={connectorFilter} onValueChange={setConnectorFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All connectors</SelectItem>
              {connectorOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Connector errors */}
      {data?.errors && data.errors.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Some connectors failed to list resources
              </p>
              <ul className="mt-2 space-y-1">
                {data.errors.map((err) => (
                  <li key={err.connectorId} className="text-xs text-amber-700 dark:text-amber-300">
                    <span className="font-medium">{err.connectorName}:</span> {err.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Loading / error / empty */}
      {isLoading && (
        <div className="card-claude p-12 text-center">
          <p className="text-sm text-muted-foreground">Loading resources…</p>
        </div>
      )}
      {error && (
        <div className="card-claude p-12 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load resources.</p>
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="card-claude p-12">
          <div className="text-center max-w-md mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
              <FileText className="w-6 h-6 text-primary" strokeWidth={1.75} />
            </div>
            <h3 className="font-serif text-2xl tracking-tight text-foreground">
              {search || connectorFilter !== 'all' ? 'No matches' : 'No resources yet'}
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              {search || connectorFilter !== 'all'
                ? 'Try a different search or filter.'
                : 'Add a connector and upload some files to see them here.'}
            </p>
          </div>
        </div>
      )}

      {/* Grouped resource list */}
      {filtered.length > 0 && (
        <div className="space-y-4">
          {Array.from(groupedByConnector.entries()).map(([connectorId, group]) => {
            const Icon = TYPE_ICON[group.type] ?? FileText;
            return (
              <div key={connectorId} className="card-claude overflow-hidden">
                <div className="px-6 py-3.5 border-b border-border bg-muted/40 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-serif text-base text-foreground tracking-tight">
                      {group.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {group.type}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-6 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Name
                      </th>
                      <th className="text-left px-6 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        URI
                      </th>
                      <th className="text-left px-6 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase w-32">
                        MIME
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((item) => (
                      <tr key={item.uri} className="hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-2.5 text-foreground">
                          {item.name}
                        </td>
                        <td className="px-6 py-2.5">
                          <code className="font-mono text-xs text-muted-foreground break-all">
                            {item.uri}
                          </code>
                        </td>
                        <td className="px-6 py-2.5 text-xs text-muted-foreground">
                          {item.mimeType ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && !error && filtered.length > 0 && (
        <>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            itemLabel="resources"
          />
          <p className="text-xs text-muted-foreground text-center">
            Resources are discovered live from each connector when this page loads.{' '}
            <button
              onClick={() => refetch()}
              className="text-primary hover:underline underline-offset-4"
            >
              Refresh
            </button>
          </p>
        </>
      )}
    </div>
  );
}
