import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Plug,
  Bot,
  FileText,
  Shield,
  ClipboardList,
  Settings,
  Sparkles,
  Briefcase,
  Users as UsersIcon,
} from 'lucide-react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceForm } from '../forms/WorkspaceForm';
import { useAuthStore } from '../../stores/authStore';

const baseLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/workspaces', label: 'Workspaces', icon: Briefcase, adminOnly: false },
  { to: '/connectors', label: 'Connectors', icon: Plug, adminOnly: false },
  { to: '/agents', label: 'Agents', icon: Bot, adminOnly: false },
  { to: '/resources', label: 'Resources', icon: FileText, adminOnly: false },
  { to: '/policies', label: 'Policies', icon: Shield, adminOnly: false },
  { to: '/audit', label: 'Audit', icon: ClipboardList, adminOnly: false },
  { to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
];

export function Sidebar() {
  const [openCreate, setOpenCreate] = useState(false);
  const userRole = useAuthStore((s) => s.user?.role);
  const isAdmin = userRole === 'admin';

  const links = baseLinks.filter((l) => !l.adminOnly || isAdmin);

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Brand */}
      <div className="h-16 flex items-center gap-2.5 px-6 border-b border-border">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
        </div>
        <span className="font-serif text-xl tracking-tight text-foreground">
          ContextGate
        </span>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 pt-3 pb-2">
        <WorkspaceSwitcher onCreate={() => setOpenCreate(true)} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          ContextGate <span className="font-mono">v0.1.0</span>
        </p>
      </div>

      <WorkspaceForm open={openCreate} onOpenChange={setOpenCreate} />
    </aside>
  );
}
