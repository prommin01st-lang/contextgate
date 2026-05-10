import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function Settings() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const displayName = user?.name || user?.email || 'User';

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your account and appearance preferences.
        </p>
      </div>

      {/* Account */}
      <section className="card-claude p-6">
        <h2 className="font-serif text-xl tracking-tight text-foreground mb-4">
          Account
        </h2>
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {user?.email ?? '—'}
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">User ID</p>
            <p className="font-mono text-xs text-foreground">
              {user?.id?.slice(0, 16) ?? '—'}…
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Role</p>
            <span className="pill pill-info inline-flex">admin</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={logout}>
            <UserIcon className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </section>

      {/* Appearance */}
      <section className="card-claude p-6">
        <h2 className="font-serif text-xl tracking-tight text-foreground mb-1">
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how ContextGate looks on this device.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = mounted && theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
                  active
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border bg-card hover:bg-muted'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    active ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {opt.label}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* About */}
      <section className="card-claude p-6">
        <h2 className="font-serif text-xl tracking-tight text-foreground mb-4">
          About
        </h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Version</dt>
            <dd className="font-mono text-foreground mt-1">v0.1.0</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">API Endpoint</dt>
            <dd className="font-mono text-foreground mt-1 truncate">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:8899'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
