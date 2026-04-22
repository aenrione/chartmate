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

  const isChart = activeItem.itemType === 'chart';

  let badgeVariant: 'guitar' | 'drums' | undefined;
  let badgeLabel: string | null = null;

  if (isChart) {
    const isDrums = activeItem.name.toLowerCase().includes('drum');
    badgeVariant = isDrums ? 'drums' : 'guitar';
    badgeLabel = isDrums ? 'Drums' : 'Guitar';
  } else if (activeItem.itemType === 'composition') {
    badgeLabel = 'Guitar Tab';
  } else if (activeItem.itemType === 'pdf') {
    badgeLabel = 'PDF';
  }

  return (
    <div className="px-4 lg:px-6 py-2 lg:py-3 flex items-center gap-3 border-b border-white/5 bg-surface">
      <div className="flex-1 min-w-0">
        <h2 className="text-sm lg:text-lg font-headline font-extrabold text-on-surface truncate">
          {activeItem.name}
        </h2>
        {activeItem.artist && (
          <p className="text-xs lg:text-sm text-on-surface-variant truncate hidden lg:block">{activeItem.artist}</p>
        )}
      </div>

      {badgeLabel && (
        <span className="hidden lg:inline-flex">
          {badgeVariant
            ? <Badge variant={badgeVariant}>{badgeLabel}</Badge>
            : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">{badgeLabel}</span>
          }
        </span>
      )}

      {speed !== 100 && (
        <span className="text-xs font-mono text-tertiary bg-tertiary-container/20 px-2 py-0.5 rounded-full">
          {speed}%
        </span>
      )}

      {isChart && (
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${STATUS_DOT[songStatus]}`} />
          <span className="text-xs text-on-surface-variant hidden lg:inline">{STATUS_LABEL[songStatus]}</span>
        </div>
      )}
    </div>
  );
}
