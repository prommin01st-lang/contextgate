import { CheckCircle2, AlertCircle, X, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '../../stores/toastStore';
import { cn } from '../../lib/utils';

const variantStyles: Record<NonNullable<Toast['variant']>, string> = {
  default: 'bg-card border-border',
  success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50',
  error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50',
  warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50',
};

const variantIcon: Record<NonNullable<Toast['variant']>, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-muted-foreground" />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  error: <AlertCircle className="h-5 w-5 text-red-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const variant = t.variant ?? 'default';
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-2xl border px-4 py-3 shadow-card flex gap-3 items-start',
              'animate-in slide-in-from-right-full',
              variantStyles[variant]
            )}
          >
            <div className="shrink-0 mt-0.5">{variantIcon[variant]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              {t.description && (
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {t.description}
                </p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
