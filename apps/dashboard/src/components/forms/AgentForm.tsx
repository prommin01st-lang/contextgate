import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Switch } from '../ui/Switch';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { ApiKeyRevealDialog } from './ApiKeyRevealDialog';

interface Agent {
  id: string;
  name: string;
  workspaceId: string;
  isActive: boolean;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Agent;
}

export function AgentForm({ open, onOpenChange, initial }: Props) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { selectedWorkspaceId } = useWorkspaceStore();

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces-list'],
    queryFn: async () => {
      const res = await api.get('api/workspaces').json<{ data: Workspace[] }>();
      return res.data;
    },
  });

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setWorkspaceId(initial?.workspaceId ?? selectedWorkspaceId ?? '');
      setIsActive(initial?.isActive ?? true);
    }
  }, [open, initial, selectedWorkspaceId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return api
          .patch(`api/agents/${initial!.id}`, { json: { name, isActive } })
          .json();
      }
      return api
        .post('api/agents', { json: { workspaceId, name, isActive } })
        .json<{ data: Agent; apiKey: string }>();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['api/agents'] });
      if (!isEdit && (data as { apiKey?: string }).apiKey) {
        setRevealedKey((data as { apiKey: string }).apiKey);
      } else {
        toast.success(isEdit ? 'Agent updated' : 'Agent created');
        onOpenChange(false);
      }
    },
    onError: () => toast.error('Failed to save agent'),
  });

  return (
    <>
      <Dialog open={open && !revealedKey} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit agent' : 'New agent'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update agent details. API key cannot be changed.'
                : 'Generate an API key for an MCP-compatible AI client.'}
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
              <Label htmlFor="ag-name">Name</Label>
              <Input
                id="ag-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Claude Desktop"
              />
            </div>

            {!isEdit && (
              <div>
                <Label>Workspace</Label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive agents cannot connect via MCP
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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
              <Button
                type="submit"
                disabled={mutation.isPending || (!isEdit && !workspaceId)}
              >
                {mutation.isPending
                  ? 'Saving…'
                  : isEdit
                  ? 'Save changes'
                  : 'Create agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ApiKeyRevealDialog
        apiKey={revealedKey}
        onClose={() => {
          setRevealedKey(null);
          onOpenChange(false);
        }}
      />
    </>
  );
}
