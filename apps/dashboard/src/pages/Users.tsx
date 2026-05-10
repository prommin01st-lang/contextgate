import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users as UsersIcon, Pencil, Trash2, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { UserForm } from '../components/forms/UserForm';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../lib/usePagination';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export function Users() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('api/users').json<{ data: User[] }>();
      return res.data;
    },
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(filtered, 10);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`api/users/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete user'),
  });

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-4xl tracking-tight text-foreground">Users</h1>
        <div className="card-claude p-12">
          <div className="text-center max-w-md mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
              <Shield className="w-6 h-6 text-primary" strokeWidth={1.75} />
            </div>
            <h3 className="font-serif text-2xl tracking-tight text-foreground">
              Admin only
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              You need the <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">admin</code> role to manage users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Users
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage accounts and roles for your ContextGate instance.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          New user
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search users by email or name…"
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
                Email
              </th>
              <th className="px-6 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Role
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
                <td className="px-6 py-8 text-muted-foreground" colSpan={5}>
                  Loading users…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td className="px-6 py-8 text-red-600 dark:text-red-400" colSpan={5}>
                  Failed to load users.
                </td>
              </tr>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-12" colSpan={5}>
                  <div className="text-center">
                    <UsersIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">
                      {search ? 'No matches' : 'No users yet'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {pageItems.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">
                        {u.name ?? '—'}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`pill ${u.role === 'admin' ? 'pill-info' : 'pill-muted'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditTarget(u)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(u)}
                        title={isSelf ? "Cannot delete yourself" : "Delete"}
                        className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30"
                        disabled={isSelf}
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
        itemLabel="users"
      />

      <UserForm open={createOpen} onOpenChange={setCreateOpen} isAdmin />
      <UserForm
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ?? undefined}
        isAdmin
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete user?"
        description={`This will permanently delete the account "${deleteTarget?.email}". They will be signed out immediately.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
