import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Briefcase, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useWorkspaceStore, type Workspace } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';

interface Props {
  onCreate?: () => void;
}

export function WorkspaceSwitcher({ onCreate }: Props) {
  const { workspaces, selectedWorkspaceId, setWorkspaces, selectWorkspace } =
    useWorkspaceStore();

  const { data } = useQuery({
    queryKey: ['workspaces-switcher'],
    queryFn: async () => {
      const res = await api.get('api/workspaces').json<{ data: Workspace[] }>();
      return res.data;
    },
  });

  useEffect(() => {
    if (data) setWorkspaces(data);
  }, [data, setWorkspaces]);

  const selected = workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-xl',
            'bg-card border border-border hover:bg-muted transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="text-sm font-medium text-foreground truncate">
              {selected?.name ?? 'Select…'}
            </p>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[14rem] rounded-xl border border-border bg-card shadow-hover p-1"
        >
          {workspaces.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              No workspaces yet
            </div>
          )}
          {workspaces.map((w) => (
            <DropdownMenu.Item
              key={w.id}
              onSelect={() => selectWorkspace(w.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
            >
              <div className="flex-1 truncate">
                <p className="text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{w.slug}</p>
              </div>
              {w.id === selectedWorkspaceId && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </DropdownMenu.Item>
          ))}
          {onCreate && (
            <>
              <DropdownMenu.Separator className="h-px my-1 bg-border" />
              <DropdownMenu.Item
                onSelect={onCreate}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none data-[highlighted]:bg-muted text-primary"
              >
                <Plus className="w-4 h-4" />
                New workspace
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
