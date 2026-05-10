import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Plug, Pencil, Trash2, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { ConnectorForm } from '../components/forms/ConnectorForm';
import { FileBrowserDialog } from '../components/forms/FileBrowserDialog';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { toast } from '../stores/toastStore';

interface Connector {
  id: string;
  name: string;
  type: string;
  workspaceId: string;
  config: Record<string, unknown>;
  isActive: boolean;
  readOnly: boolean;
  createdAt: string;
}

export function Connectors() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connector | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);
  const [filesTarget, setFilesTarget] = useState<Connector | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['connectors'],
    queryFn: async () => {
      const res = await api.get('api/connectors').json<{ data: Connector[] }>();
      return res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
    );
  }, [data, search]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(filtered, 10);

  // Reset to page 1 when search changes (new filter ⇒ shorter list)
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`api/connectors/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      toast.success('Connector deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete connector'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Connectors
          </h1>
          <p className="text-muted-foreground mt-2">
            Data sources that agents can query through MCP.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          New connector
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search connectors by name or type…"
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
                Type
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Mode
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td className="px-6 py-8 text-muted-foreground" colSpan={5}>
                  Loading connectors…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={5}>
                  Failed to load connectors.
                </td>
              </tr>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={5}>
                  <div className="text-center">
                    <Plug className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">
                      {search ? 'No matches' : 'No connectors yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search
                        ? 'Try a different search term'
                        : 'Add your first data source to start'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {pageItems.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{c.name}</td>
                <td className="px-6 py-4">
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                    {c.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`pill ${c.isActive ? 'pill-success' : 'pill-muted'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`pill ${c.readOnly ? 'pill-info' : 'pill-warning'}`}>
                    {c.readOnly ? 'Read-only' : 'Read-write'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    {c.type === 'filesystem' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setFilesTarget(c)}
                        title="Manage files"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(c)}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(c)}
                      title="Delete"
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
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
        itemLabel="connectors"
      />

      <ConnectorForm open={createOpen} onOpenChange={setCreateOpen} />
      <ConnectorForm
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ?? undefined}
      />
      {filesTarget && (
        <FileBrowserDialog
          open={Boolean(filesTarget)}
          onOpenChange={(o) => !o && setFilesTarget(null)}
          connectorId={filesTarget.id}
          connectorName={filesTarget.name}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete connector?"
        description={`This will permanently delete "${deleteTarget?.name}". Agents will lose access to its resources.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
