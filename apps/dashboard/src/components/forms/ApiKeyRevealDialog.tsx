import { useState } from 'react';
import { Copy, Check, Key } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { toast } from '../../stores/toastStore';

interface Props {
  apiKey: string | null;
  onClose: () => void;
}

export function ApiKeyRevealDialog({ apiKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Dialog open={Boolean(apiKey)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Key className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Save your API key</DialogTitle>
              <DialogDescription className="mt-2">
                Copy this key now — you won't be able to see it again. Store it
                somewhere safe.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl bg-muted/40 border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            API KEY
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs text-foreground break-all">
              {apiKey ?? ''}
            </code>
            <Button size="icon" variant="secondary" onClick={handleCopy}>
              {copied ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Use this key in the <code className="px-1 py-0.5 rounded bg-muted font-mono">x-api-key</code> header when connecting from your AI client.
        </p>

        <DialogFooter>
          <Button onClick={onClose}>I've saved my key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
