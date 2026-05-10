import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Bot, Pencil, Trash2, AlertTriangle, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { AgentForm } from '../components/forms/AgentForm';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { toast } from '../stores/toastStore';

interface Agent {
  id: string;
  name: string;
  workspaceId: string;
  isActive: boolean;
  lastAccessedAt: string | null;
  createdAt: string;
}

interface Policy {
  id: string;
  agentId: string | null;
  workspaceId: string | null;
}

export function Agents() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('api/agents').json<{ data: Agent[] }>();
      return res.data;
    },
  });

  const { data: policies } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const res = await api.get('api/policies').json<{ data: Policy[] }>();
      return res.data;
    },
  });

  // Build per-agent policy count map
  const policyCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    if (!policies) return map;
    for (const p of policies) {
      if (p.agentId) map.set(p.agentId, (map.get(p.agentId) ?? 0) + 1);
    }
    return map;
  }, [policies]);

  // Workspace-scoped policies cover ALL agents in that workspace
  const workspacePolicyCount = useMemo(() => {
    const map = new Map<string, number>();
    if (!policies) return map;
    for (const p of policies) {
      if (p.workspaceId)
        map.set(p.workspaceId, (map.get(p.workspaceId) ?? 0) + 1);
    }
    return map;
  }, [policies]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((a) => a.name.toLowerCase().includes(q));
  }, [data, search]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(filtered, 10);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const agentsWithoutPolicy = useMemo(() => {
    if (!data) return [];
    return data.filter((a) => {
      const direct = policyCountByAgent.get(a.id) ?? 0;
      const fromWorkspace = workspacePolicyCount.get(a.workspaceId) ?? 0;
      return direct + fromWorkspace === 0;
    });
  }, [data, policyCountByAgent, workspacePolicyCount]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`api/agents/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete agent'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Agents
          </h1>
          <p className="text-muted-foreground mt-2">
            AI clients with API keys to query your data via MCP.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          New agent
        </Button>
      </div>

      {/* Warning banner for agents without policies */}
      {agentsWithoutPolicy.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {agentsWithoutPolicy.length === 1
                  ? '1 agent has no policy assigned — all tool calls will be denied'
                  : `${agentsWithoutPolicy.length} agents have no policies assigned — all tool calls will be denied`}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                Visit the{' '}
                <a
                  href="/policies"
                  className="underline underline-offset-2 font-medium"
                >
                  Policies page
                </a>{' '}
                to grant access. New agents now auto-receive read+list policies for active connectors.
              </p>
            </div>
          </div>
        </div>
      )}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search agents by name…"
        className="max-w-sm"
      />

      <div className="card-claude overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Name
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Policies
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Last seen
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Created
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td className="px-6 py-8 text-muted-foreground" colSpan={6}>
                  Loading agents…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={6}>
                  Failed to load agents.
                </td>
              </tr>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={6}>
                  <div className="text-center">
                    <Bot className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">
                      {search ? 'No matches' : 'No agents yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search
                        ? 'Try a different search term'
                        : 'Create an agent to generate an API key for MCP clients'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {pageItems.map((a) => {
              const direct = policyCountByAgent.get(a.id) ?? 0;
              const fromWs = workspacePolicyCount.get(a.workspaceId) ?? 0;
              const totalPolicies = direct + fromWs;
              return (
                <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {a.name}
                      {totalPolicies === 0 && (
                        <span title="No policies — denied by default">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`pill ${a.isActive ? 'pill-success' : 'pill-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${a.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {totalPolicies > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        {totalPolicies}
                        {fromWs > 0 && direct > 0 && (
                          <span className="text-muted-foreground/60">
                            ({direct} agent + {fromWs} workspace)
                          </span>
                        )}
                        {fromWs > 0 && direct === 0 && (
                          <span className="text-muted-foreground/60">workspace</span>
                        )}
                      </span>
                    ) : (
                      <span className="pill pill-warning">no policy</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {a.lastAccessedAt
                      ? new Date(a.lastAccessedAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditTarget(a)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(a)}
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
        itemLabel="agents"
      />

      <AgentForm open={createOpen} onOpenChange={setCreateOpen} />
      <AgentForm
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ?? undefined}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete agent?"
        description={`This will revoke "${deleteTarget?.name}"'s API key and delete its policies. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
