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

interface Policy {
  id: string;
  agentId: string | null;
  workspaceId: string | null;
  resourcePattern: string;
  actions: string[];
}

interface Agent {
  id: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Policy;
}

const ACTION_OPTIONS = ['read', 'list', 'query', 'use', 'write', 'delete'];
type Scope = 'agent' | 'workspace';

export function PolicyForm({ open, onOpenChange, initial }: Props) {
  const isEdit = Boolean(initial);
  const [scope, setScope] = useState<Scope>('agent');
  const [agentId, setAgentId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [resourcePattern, setResourcePattern] = useState('');
  const [actions, setActions] = useState<string[]>(['read']);
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (open) {
      const initialScope: Scope = initial?.workspaceId ? 'workspace' : 'agent';
      setScope(initialScope);
      setAgentId(initial?.agentId ?? '');
      setWorkspaceId(initial?.workspaceId ?? '');
      setResourcePattern(initial?.resourcePattern ?? '');
      setActions(initial?.actions ?? ['read']);
    }
  }, [open, initial]);

  const toggleAction = (action: string) => {
    setActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return api
          .patch(`api/policies/${initial!.id}`, {
            json: { resourcePattern, actions },
          })
          .json();
      }
      const body: Record<string, unknown> = {
        resourcePattern,
        actions,
      };
      if (scope === 'agent') body.agentId = agentId;
      else body.workspaceId = workspaceId;

      return api.post('api/policies', { json: body }).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      toast.success(isEdit ? 'Policy updated' : 'Policy created');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to save policy'),
  });

  const isValid =
    isEdit
      ? actions.length > 0 && resourcePattern.length > 0
      : actions.length > 0 &&
        resourcePattern.length > 0 &&
        ((scope === 'agent' && agentId) || (scope === 'workspace' && workspaceId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit policy' : 'New policy'}</DialogTitle>
          <DialogDescription>
            {scope === 'agent'
              ? 'Allow a single agent to perform actions on resources matching a pattern.'
              : 'Workspace policies apply to all agents in the workspace — use for shared baselines.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          {/* Scope picker (only shown when creating) */}
          {!isEdit && (
            <div>
              <Label>Scope</Label>
              <div className="flex gap-2">
                {(['agent', 'workspace'] as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                      scope === s
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:bg-muted text-foreground'
                    }`}
                  >
                    {s === 'agent' ? 'Per agent' : 'Workspace-wide'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target picker */}
          {!isEdit && scope === 'agent' && (
            <div>
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEdit && scope === 'workspace' && (
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

          <div>
            <Label htmlFor="po-pattern">Resource pattern</Label>
            <Input
              id="po-pattern"
              required
              value={resourcePattern}
              onChange={(e) => setResourcePattern(e.target.value)}
              placeholder="filesystem://*/*.md"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Glob pattern. Examples:{' '}
              <code className="font-mono">filesystem://*/file/**</code>,{' '}
              <code className="font-mono">notion://*/page/*</code>
            </p>
          </div>

          <div>
            <Label>Allowed actions</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ACTION_OPTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => toggleAction(action)}
                  className={`pill cursor-pointer transition-colors ${
                    actions.includes(action)
                      ? 'pill-info ring-clay-400'
                      : 'pill-muted hover:bg-muted-foreground/20'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
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
            <Button type="submit" disabled={mutation.isPending || !isValid}>
              {mutation.isPending
                ? 'Saving…'
                : isEdit
                ? 'Save changes'
                : 'Create policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
