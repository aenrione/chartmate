import {CheckCircle2} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Session} from '@/lib/local-db/programs';

interface SessionChipProps {
  session: Session;
  onClick: (e: React.MouseEvent) => void;
}

export default function SessionChip({session, onClick}: SessionChipProps) {
  const done = !!session.completedAt;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1',
        done
          ? 'bg-primary/20 text-primary line-through opacity-60'
          : 'bg-primary/30 text-on-primary-container hover:bg-primary/50',
      )}
    >
      {done && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      <span className="truncate">{session.title ?? 'Practice session'}</span>
    </button>
  );
}
