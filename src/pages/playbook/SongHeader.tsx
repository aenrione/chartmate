import {Badge} from '@/components/ui/badge';
import {usePlaybook} from './PlaybookProvider';
import type {ProgressStatus} from '@/lib/local-db/playbook';

const STATUS_DOT: Record<ProgressStatus, string> = {
  not_started: 'bg-outline',
  needs_work: 'bg-error',
  practicing: 'bg-tertiary',
  nailed_it: 'bg-green-400',
};

const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'Not Started',
  needs_work: 'Needs Work',
  practicing: 'Practicing',
  nailed_it: 'Nailed It',
};

export default function SongHeader() {
  const {activeItem, speed, songStatus} = usePlaybook();
  if (!activeItem) return null;

  // Determine instrument from chart name heuristic -- badge variant
  const isGuitar = activeItem.name.toLowerCase().includes('guitar');
  const isDrums = activeItem.name.toLowerCase().includes('drum');
  const instrumentVariant = isDrums ? 'drums' : 'guitar';
  const instrumentLabel = isDrums ? 'Drums' : isGuitar ? 'Guitar' : 'Guitar';

  return (
    <div className="px-6 py-3 flex items-center gap-4 border-b border-white/5 bg-surface">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-headline font-extrabold text-on-surface truncate">
          {activeItem.name}
        </h2>
        <p className="text-sm text-on-surface-variant truncate">{activeItem.artist}</p>
      </div>

      <Badge variant={instrumentVariant as 'guitar' | 'drums'}>{instrumentLabel}</Badge>

      {speed !== 100 && (
        <span className="text-xs font-mono text-tertiary bg-tertiary-container/20 px-2 py-0.5 rounded-full">
          {speed}%
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${STATUS_DOT[songStatus]}`} />
        <span className="text-xs text-on-surface-variant">{STATUS_LABEL[songStatus]}</span>
      </div>
    </div>
  );
}
