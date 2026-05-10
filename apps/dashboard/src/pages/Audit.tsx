import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, RefreshCw } from 'lucide-react';
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
import { cn } from '../lib/utils';

interface AuditLog {
  id: string;
  workspaceId: string;
  agentId: string | null;
  action: string;
  resourceUri: string | null;
  status: string;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 25;

export function Audit() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: async () => {
      const res = await api
        .get('api/audit-logs', {
          searchParams: { limit: PAGE_SIZE, offset },
        })
        .json<AuditResponse>();
      return res;
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const filtered = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((log) => {
      const matchesSearch =
        !search ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        (log.resourceUri ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' || log.status.toLowerCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-2">
            Every resource access and admin action across your workspace.
          </p>
        </div>
        <button
          onClick={() => setAutoRefresh((s) => !s)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            autoRefresh
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
              : 'bg-muted text-muted-foreground border-border'
          )}
        >
          <RefreshCw
            className={cn('w-3 h-3', autoRefresh && isFetching && 'animate-spin')}
          />
          {autoRefresh ? 'Live' : 'Paused'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search action or resource on this page…"
          className="max-w-sm flex-1"
        />
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="allowed">Allowed</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="card-claude overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Action
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Resource
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td className="px-6 py-8 text-muted-foreground" colSpan={4}>
                  Loading audit logs…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={4}>
                  Failed to load audit logs.
                </td>
              </tr>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={4}>
                  <div className="text-center">
                    <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">
                      {search || statusFilter !== 'all'
                        ? 'No matches on this page'
                        : 'No audit logs yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || statusFilter !== 'all'
                        ? 'Try a different page or different filters'
                        : 'Activity will appear here once agents start using ContextGate'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((log) => {
              const status = log.status.toLowerCase();
              const pillCls =
                status === 'allowed' || status === 'success'
                  ? 'pill-success'
                  : status === 'denied' || status === 'error'
                  ? 'pill-danger'
                  : 'pill-muted';
              return (
                <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-foreground bg-muted px-2 py-0.5 rounded-md">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs truncate max-w-md">
                    {log.resourceUri ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`pill ${pillCls}`}>{log.status}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        start={start}
        end={end}
        onPageChange={setPage}
        itemLabel="logs"
      />
    </div>
  );
}
