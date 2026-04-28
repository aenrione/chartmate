// src/components/ProgressionPill.tsx
//
// Small global progression indicator: shows the current streak + the highest-level instrument.
// Visible across every page — exists so XP earned outside /learn (rudiments, ear training,
// fretboard drills, repertoire, playbook, programs/goals) feels real to the user immediately,
// not just when they navigate back to the learn surface.

import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Flame} from 'lucide-react';
import {cn} from '@/lib/utils';
import {getLearnStats, getAllInstrumentLevels} from '@/lib/local-db/learn';

interface PillState {
  streak: number;
  topLevel: number;
}

export default function ProgressionPill() {
  const [state, setState] = useState<PillState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [stats, levels] = await Promise.all([
          getLearnStats(),
          getAllInstrumentLevels(),
        ]);
        if (cancelled) return;
        const topLevel = levels.reduce((m, l) => Math.max(m, l.level), 1);
        setState({streak: stats.streak, topLevel});
      } catch {
        // Tables may not be migrated yet on first launch — silently no-op.
      }
    };
    load();
    const onProgression = () => load();
    window.addEventListener('progression-changed', onProgression);
    return () => {
      cancelled = true;
      window.removeEventListener('progression-changed', onProgression);
    };
  }, []);

  if (!state) return null;

  return (
    <Link
      to="/profile"
      className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-xs"
      title={`Top instrument level ${state.topLevel} · ${state.streak}-day streak — open profile`}
    >
      <span className="font-semibold text-on-surface">Lv {state.topLevel}</span>
      <span className={cn('flex items-center gap-0.5', state.streak > 0 ? 'text-orange-500' : 'text-on-surface-variant/60')}>
        <Flame className="h-3 w-3" />
        <span className="font-semibold">{state.streak}</span>
      </span>
    </Link>
  );
}
