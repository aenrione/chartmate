/**
 * Phase 1 UI: Let the user pick Spotify streaming history JSON files for
 * one-time historical import into the local spotify_history table.
 */

import {Upload, CheckCircle2, Loader2, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {useSpotifyHistoryImport} from '@/lib/spotify-sdk/useSpotifyHistoryImport';

export default function SpotifyHistoryImportCard() {
  const {status, importHistoryFiles, reset} = useSpotifyHistoryImport();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import Play History
        </CardTitle>
        <CardDescription>
          Upload your{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            Streaming_History_Audio_*.json
          </code>{' '}
          files from your Spotify data export for a complete play history. Each
          file is only imported once — re-uploading the same file is safe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.phase === 'idle' && (
          <Button variant="outline" onClick={importHistoryFiles}>
            <Upload className="h-4 w-4 mr-2" />
            Select JSON Files
          </Button>
        )}

        {status.phase === 'picking' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening file picker…
          </div>
        )}

        {status.phase === 'importing' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importing {status.current} / {status.total}:{' '}
            <span className="font-mono text-xs truncate max-w-[240px]">
              {status.filename}
            </span>
          </div>
        )}

        {status.phase === 'done' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Import complete</p>
                <p className="text-muted-foreground">
                  {status.imported} file{status.imported !== 1 ? 's' : ''} imported
                  ({status.totalTracks.toLocaleString()} unique tracks)
                  {status.skipped > 0 && `, ${status.skipped} skipped`}.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              Import More Files
            </Button>
          </div>
        )}

        {status.phase === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Import failed</p>
                <p className="text-muted-foreground font-mono text-xs break-all">
                  {status.message}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
