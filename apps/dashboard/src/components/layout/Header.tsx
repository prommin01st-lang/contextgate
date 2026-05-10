import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export function Header() {
  const { user, logout } = useAuthStore();
  const displayName = user?.name || user?.email || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="h-16 bg-card/60 backdrop-blur-sm border-b border-border flex items-center justify-end px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-muted border border-border">
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            {initial !== 'U' ? initial : <User className="h-3.5 w-3.5" />}
          </div>
          <span className="text-sm font-medium text-foreground">
            {displayName}
          </span>
        </div>
        <button
          onClick={logout}
          className="btn-ghost"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
