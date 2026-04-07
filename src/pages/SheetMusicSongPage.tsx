import {useParams} from 'react-router-dom';
import {Loader2} from 'lucide-react';
import {useChartLoader} from '@/lib/useChartLoader';
import SongView from './sheet-music/SongView';

export default function SheetMusicSongPage() {
  const {slug} = useParams<{slug: string}>();
  const {data, loading, error, status} = useChartLoader(slug ?? null);

  if (!slug) return null;

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-destructive">Error: {error}</span>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-on-surface-variant">{status}</span>
      </div>
    );
  }

  return (
    <SongView
      metadata={data.metadata}
      chart={data.chart}
      audioFiles={data.audioFiles}
    />
  );
}
