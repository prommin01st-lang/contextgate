import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, Pencil, Trash2, Bot, Briefcase } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { PolicyForm } from '../components/forms/PolicyForm';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { toast } from '../stores/toastStore';

interface Policy {
  id: string;
  agentId: string | null;
  workspaceId: string | null;
  resourcePattern: string;
  actions: string[];
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

export function Policies() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const queryClient = useQueryClient();

  const { data: policies, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const res = await api.get('api/policies').json<{ data: Policy[] }>();
      return res.data;
    },
  });

  const { data: agents } = useQuery({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const res = await api.get('api/agents').json<{ data: Agent[] }>();
      return res.data;
    },
  });

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces-list'],
    queryFn: async () => {
      const res = await api.get('api/workspaces').json<{ data: Workspace[] }>();
      return res.data;
    },
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents?.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  const workspaceMap = useMemo(() => {
    const m = new Map<string, string>();
    workspaces?.forEach((w) => m.set(w.id, w.name));
    return m;
  }, [workspaces]);

  const filtered = useMemo(() => {
    if (!policies) return [];
    if (!search) return policies;
    const q = search.toLowerCase();
    return policies.filter((p) => {
      const target =
        (p.agentId && agentMap.get(p.agentId)) ||
        (p.workspaceId && workspaceMap.get(p.workspaceId)) ||
        '';
      return (
        p.resourcePattern.toLowerCase().includes(q) ||
        target.toLowerCase().includes(q)
      );
    });
  }, [policies, search, agentMap, workspaceMap]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(filtered, 10);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`api/policies/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      toast.success('Policy deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete policy'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Policies
          </h1>
          <p className="text-muted-foreground mt-2">
            Glob-pattern rules that decide which resources agents can access.
            Scope to a single agent or apply across an entire workspace.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          New policy
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by pattern, agent, or workspace…"
        className="max-w-sm"
      />

      <div className="card-claude overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Scope
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Resource pattern
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Actions
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase w-24">
                Edit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td className="px-6 py-8 text-muted-foreground" colSpan={4}>
                  Loading policies…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={4}>
                  Failed to load policies.
                </td>
              </tr>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={4}>
                  <div className="text-center max-w-md mx-auto">
                    <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">
                      {search ? 'No matches' : 'No policies yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search
                        ? 'Try a different search'
                        : 'Without policies, agents cannot access any resource. Create your first allow rule to get started.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {pageItems.map((p) => {
              const isWorkspace = Boolean(p.workspaceId);
              const targetName = isWorkspace
                ? workspaceMap.get(p.workspaceId!)
                : agentMap.get(p.agentId!);
              return (
                <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {isWorkspace ? (
                        <Briefcase className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground text-xs">
                          {targetName ??
                            `${(isWorkspace ? p.workspaceId! : p.agentId!).slice(0, 8)}…`}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {isWorkspace ? 'workspace' : 'agent'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="font-mono text-xs text-foreground bg-muted px-2 py-1 rounded-md">
                      {p.resourcePattern}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {p.actions.map((a) => (
                        <span key={a} className="pill pill-info">
                          {a}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditTarget(p)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(p)}
                        title="Delete"
                        className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
        itemLabel="policies"
      />

      <PolicyForm open={createOpen} onOpenChange={setCreateOpen} />
      <PolicyForm
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ?? undefined}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete policy?"
        description="This will revoke matching agents' access to resources covered by this pattern."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
