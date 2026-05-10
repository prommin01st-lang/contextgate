import { useQuery } from '@tanstack/react-query';
import { Briefcase, Bot, Plug, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspaceStore';

function useCount(endpoint: string) {
  return useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      const data = await api.get(endpoint).json<{ count: number } | unknown[] | { data: unknown[] }>();
      if (Array.isArray(data)) return data.length;
      if (data && typeof data === 'object') {
        if ('data' in data && Array.isArray(data.data)) return data.data.length;
        if ('count' in data && typeof data.count === 'number') return data.count;
      }
      return 0;
    },
  });
}

export function Dashboard() {
  const { workspaces } = useWorkspaceStore();
  const { data: workspaceCount, isLoading: wsLoading } = useCount('api/workspaces');
  const { data: agentCount, isLoading: agentLoading } = useCount('api/agents');
  const { data: connectorCount, isLoading: connLoading } = useCount('api/connectors');

  const stats = [
    {
      label: 'Workspaces',
      value: wsLoading ? '…' : (workspaceCount ?? workspaces.length),
      icon: Briefcase,
      hint: 'Active organizations',
    },
    {
      label: 'Agents',
      value: agentLoading ? '…' : (agentCount ?? 0),
      icon: Bot,
      hint: 'Connected AI clients',
    },
    {
      label: 'Connectors',
      value: connLoading ? '…' : (connectorCount ?? 0),
      icon: Plug,
      hint: 'Data sources online',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Welcome back. Here's what's happening across your workspace.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card-claude p-6">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/40" />
              </div>
              <p className="mt-5 text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-serif text-4xl tracking-tight text-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="card-claude p-6">
        <h3 className="font-serif text-xl tracking-tight text-foreground mb-4">
          Get started
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="/connectors"
            className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Add a connector</p>
              <p className="text-xs text-muted-foreground">
                Connect FileSystem, PostgreSQL, or Notion
              </p>
            </div>
          </a>
          <a
            href="/agents"
            className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Create an agent</p>
              <p className="text-xs text-muted-foreground">
                Generate API key for MCP clients
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
