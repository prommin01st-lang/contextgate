import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { WorkspaceForm } from '../components/forms/WorkspaceForm';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { toast } from '../stores/toastStore';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export function Workspaces() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workspace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await api.get('api/workspaces').json<{ data: Workspace[] }>();
      return res.data;
    },
  });

  const { page, setPage, total, totalPages, pageItems, start, end } =
    usePagination(data ?? [], 10);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`api/workspaces/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-switcher'] });
      toast.success('Workspace deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete workspace'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Workspaces
          </h1>
          <p className="text-muted-foreground mt-2">
            Organizational boundaries for agents, connectors, and policies.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          New workspace
        </Button>
      </div>

      <div className="card-claude overflow-hidden">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Name
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Slug
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
                <td className="px-6 py-8 text-muted-foreground" colSpan={4}>
                  Loading workspaces…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={4}>
                  Failed to load workspaces.
                </td>
              </tr>
            )}
            {!isLoading && !error && data?.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={4}>
                  <div className="text-center">
                    <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">No workspaces yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first workspace to get started
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {pageItems.map((w) => (
              <tr key={w.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-6 py-4 font-medium text-foreground">{w.name}</td>
                <td className="px-6 py-4">
                  <code className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                    {w.slug}
                  </code>
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(w)}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(w)}
                      title="Delete"
                      className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
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
        itemLabel="workspaces"
      />

      <WorkspaceForm open={createOpen} onOpenChange={setCreateOpen} />
      <WorkspaceForm
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ?? undefined}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete workspace?"
        description={`This will permanently delete "${deleteTarget?.name}" along with all its agents, connectors, and policies. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
