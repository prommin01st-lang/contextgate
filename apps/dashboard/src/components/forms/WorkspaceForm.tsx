import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Workspace;
}

export function WorkspaceForm({ open, onOpenChange, initial }: Props) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setSlug(initial?.slug ?? '');
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return api
          .patch(`api/workspaces/${initial!.id}`, { json: { name } })
          .json();
      }
      return api.post('api/workspaces', { json: { name, slug } }).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['api/workspaces'] });
      toast.success(isEdit ? 'Workspace updated' : 'Workspace created');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to save workspace'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit workspace' : 'New workspace'}</DialogTitle>
          <DialogDescription>
            Workspaces group agents, connectors, and policies together.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Company"
            />
          </div>
          <div>
            <Label htmlFor="ws-slug">Slug</Label>
            <Input
              id="ws-slug"
              required
              disabled={isEdit}
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
              placeholder="my-company"
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                Slug cannot be changed after creation
              </p>
            )}
          </div>
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
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
