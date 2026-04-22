import {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Loader2, LogIn} from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function IgnitionLoginDialog({open, onOpenChange, onSuccess}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const unlisten = listen<void>('ignition://ready', () => {
      setLoading(false);
      onSuccess();
      onOpenChange(false);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [open, onSuccess, onOpenChange]);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await invoke('ignition_open_auth');
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect to CustomsForge</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            A login window will open. Sign in and ChartMate connects automatically.
          </p>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={loading} onClick={handleLogin}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Waiting for login…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Log in with CustomsForge
              </>
            )}
          </Button>
          {loading && (
            <p className="text-xs text-muted-foreground text-center">
              Complete login in the CustomsForge window. It will close automatically.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
