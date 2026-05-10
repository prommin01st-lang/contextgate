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
import { Input, Textarea } from '../ui/Input';
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

interface Connector {
  id: string;
  name: string;
  type: string;
  workspaceId: string;
  config: Record<string, unknown>;
  isActive: boolean;
  readOnly: boolean;
}

interface Workspace {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Connector;
}

const TYPE_TEMPLATES: Record<string, object> = {
  filesystem: {
    rootPath: '/data/files',
    allowedExtensions: ['.md', '.txt', '.json'],
    maxFileSize: 10485760,
  },
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'readonly',
    password: '',
    allowedTables: ['public.users'],
  },
  notion: {
    token: 'secret_xxx',
    pageIds: [],
    databaseIds: [],
  },
};

export function ConnectorForm({ open, onOpenChange, initial }: Props) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState('');
  const [type, setType] = useState('filesystem');
  const [workspaceId, setWorkspaceId] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [readOnly, setReadOnly] = useState(true);
  const [isActive, setIsActive] = useState(true);
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
      setType(initial?.type ?? 'filesystem');
      setWorkspaceId(initial?.workspaceId ?? selectedWorkspaceId ?? '');
      setConfigText(
        JSON.stringify(initial?.config ?? TYPE_TEMPLATES.filesystem, null, 2)
      );
      setReadOnly(initial?.readOnly ?? true);
      setIsActive(initial?.isActive ?? true);
    }
  }, [open, initial, selectedWorkspaceId]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (!isEdit) {
      setConfigText(
        JSON.stringify(TYPE_TEMPLATES[newType] ?? {}, null, 2)
      );
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configText);
      } catch {
        throw new Error('Invalid JSON in config');
      }

      if (isEdit) {
        return api
          .patch(`api/connectors/${initial!.id}`, {
            json: { name, config, readOnly, isActive },
          })
          .json();
      }
      return api
        .post('api/connectors', {
          json: { workspaceId, type, name, config, readOnly, isActive },
        })
        .json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['api/connectors'] });
      toast.success(isEdit ? 'Connector updated' : 'Connector created');
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg = (err as Error).message || 'Failed to save connector';
      toast.error('Save failed', msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit connector' : 'New connector'}</DialogTitle>
          <DialogDescription>
            Connectors expose data sources (files, databases, Notion) to your agents through MCP.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cn-name">Name</Label>
              <Input
                id="cn-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project docs"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={handleTypeChange}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filesystem">FileSystem</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="notion">Notion</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div>
            <Label htmlFor="cn-config">Configuration (JSON)</Label>
            <Textarea
              id="cn-config"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              spellCheck={false}
              className="min-h-[180px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Connector-specific settings (paths, credentials, whitelists)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-xs font-medium text-foreground">Active</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-xs font-medium text-foreground">Read-only</p>
              </div>
              <Switch checked={readOnly} onCheckedChange={setReadOnly} />
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
            <Button
              type="submit"
              disabled={mutation.isPending || (!isEdit && !workspaceId)}
            >
              {mutation.isPending
                ? 'Saving…'
                : isEdit
                ? 'Save changes'
                : 'Create connector'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
