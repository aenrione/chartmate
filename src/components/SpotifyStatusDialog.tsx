import { useState } from 'react';
import { Music, LogOut, RefreshCw, Loader2, CheckCircle, XCircle, User } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSpotifyAuth } from '@/contexts/SpotifyAuthContext';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GRANTED_SCOPES = [
  'user-read-email',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
];

function fmtExpiry(date: Date | null): string {
  if (!date) return '—';
  const now = new Date();
  if (date < now) return 'Expired';
  const diffMins = Math.floor((date.getTime() - now.getTime()) / 60_000);
  if (diffMins < 60) return `${diffMins}m`;
  const hrs = Math.floor(diffMins / 60);
  return `${hrs}h ${diffMins % 60}m`;
}

export default function SpotifyStatusDialog({ open, onOpenChange }: Props) {
  const { isConnected, expiresAt, userProfile, connect, disconnect, refresh } = useSpotifyAuth();
  const [loading, setLoading] = useState<'connect' | 'disconnect' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (action: 'connect' | 'disconnect' | 'refresh') => {
    setLoading(action);
    setError(null);
    try {
      if (action === 'connect') {
        await connect();
        onOpenChange(false);
      } else if (action === 'disconnect') {
        await disconnect();
      } else {
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(null);
    }
  };

  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-4 w-4 text-[#1DB954]" />
            Spotify Account
          </DialogTitle>
          <DialogDescription>
            {isConnected ? 'Session info and connection management.' : 'Connect your Spotify account to enable library sync.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* User profile */}
          {isConnected && userProfile && (
            <div className="flex items-center gap-3 rounded-lg bg-surface-container/50 px-4 py-3">
              {userProfile.image_url ? (
                <img
                  src={userProfile.image_url}
                  alt={userProfile.display_name}
                  className="h-9 w-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-on-surface-variant" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{userProfile.display_name}</p>
                {userProfile.email && (
                  <p className="text-xs text-on-surface-variant truncate">{userProfile.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-3 rounded-lg bg-surface-container/50 px-4 py-3">
            {isConnected ? (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-outline shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {isConnected ? 'Connected' : 'Not connected'}
              </p>
              {isConnected && expiresAt && (
                <p className={cn(
                  'text-xs font-mono',
                  isExpired ? 'text-red-400' : 'text-on-surface-variant',
                )}>
                  Token {isExpired ? 'expired' : `expires in ${fmtExpiry(expiresAt)}`}
                </p>
              )}
            </div>
          </div>

          {/* Scopes */}
          {isConnected && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                Granted permissions
              </p>
              <div className="rounded-lg bg-surface-container/50 px-4 py-3 space-y-1">
                {GRANTED_SCOPES.map(scope => (
                  <p key={scope} className="text-xs font-mono text-on-surface-variant">{scope}</p>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handle('refresh')}
                  disabled={loading !== null}
                >
                  {loading === 'refresh' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Refresh status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-red-400 hover:text-red-300 border-red-400/30 hover:border-red-400/60 hover:bg-red-400/10"
                  onClick={() => handle('disconnect')}
                  disabled={loading !== null}
                >
                  {loading === 'disconnect' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                className="flex-1 bg-[#1DB954] hover:bg-[#1aa34a] text-black font-semibold"
                size="sm"
                onClick={() => handle('connect')}
                disabled={loading !== null}
              >
                {loading === 'connect' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Music className="h-3.5 w-3.5 mr-1.5" />
                )}
                Connect Spotify
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
