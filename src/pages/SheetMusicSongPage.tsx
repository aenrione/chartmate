import {useParams} from 'react-router-dom';
import {Link} from 'react-router-dom';
import {Loader2, BookMarked, ArrowLeft} from 'lucide-react';
import {useChartLoader} from '@/lib/useChartLoader';
import {getSessionItemsRemaining} from '@/lib/repertoire/session-persistence';
import SongView from './sheet-music/SongView';

function ResumeSessionBanner() {
  const remaining = getSessionItemsRemaining();
  if (remaining <= 0) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-tertiary/10 border-b border-tertiary/20">
      <BookMarked className="h-4 w-4 text-tertiary shrink-0" />
      <span className="flex-1 text-sm text-on-surface">
        Review session in progress —{' '}
        <span className="font-semibold text-tertiary">{remaining} item{remaining !== 1 ? 's' : ''} remaining</span>
      </span>
      <Link
        to="/guitar/repertoire/session"
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary text-on-tertiary text-xs font-bold hover:bg-tertiary/90 transition-colors shrink-0"
      >
        <ArrowLeft className="h-3 w-3" />
        Resume
      </Link>
    </div>
  );
}

export default function SheetMusicSongPage() {
  const {slug} = useParams<{slug: string}>();
  const {data, loading, error, status} = useChartLoader(slug ?? null);

  if (!slug) return null;

  if (error) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ResumeSessionBanner />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-destructive">Error: {error}</span>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ResumeSessionBanner />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-on-surface-variant">{status}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ResumeSessionBanner />
      <SongView
        metadata={data.metadata}
        chart={data.chart}
        audioFiles={data.audioFiles}
      />
    </div>
  );
}
