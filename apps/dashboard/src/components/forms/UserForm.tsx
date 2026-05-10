import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: User;
  /** Whether the current user is an admin (controls role/email editing). */
  isAdmin?: boolean;
}

export function UserForm({ open, onOpenChange, initial, isAdmin = true }: Props) {
  const isEdit = Boolean(initial);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setEmail(initial?.email ?? '');
      setName(initial?.name ?? '');
      setPassword('');
      setRole((initial?.role as 'admin' | 'user') ?? 'user');
      setError('');
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body: Record<string, unknown> = {};
        if (name !== (initial?.name ?? '')) body.name = name || null;
        if (email !== initial?.email) body.email = email;
        if (password) body.password = password;
        if (isAdmin && role !== initial?.role) body.role = role;
        return api.patch(`api/users/${initial!.id}`, { json: body }).json();
      }
      return api
        .post('api/users', {
          json: {
            email,
            password,
            name: name || undefined,
            role,
          },
        })
        .json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(isEdit ? 'User updated' : 'User created');
      onOpenChange(false);
    },
    onError: async (err: unknown) => {
      const e = err as { response?: { json?: () => Promise<{ error?: string }> } };
      try {
        const body = await e.response?.json?.();
        setError(body?.error ?? 'Save failed');
      } catch {
        setError('Save failed');
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update profile details. Leave password blank to keep it unchanged.'
              : 'Create a new account that can sign into ContextGate.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEdit && !isAdmin}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label htmlFor="u-name">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
            />
          </div>
          <div>
            <Label htmlFor="u-password">
              Password{' '}
              {isEdit && (
                <span className="text-muted-foreground font-normal">
                  (leave blank to keep)
                </span>
              )}
            </Label>
            <Input
              id="u-password"
              type="password"
              required={!isEdit}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••••' : 'At least 6 characters'}
            />
          </div>
          {isAdmin && (
            <div>
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as 'admin' | 'user')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Saving…'
                : isEdit
                ? 'Save changes'
                : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
