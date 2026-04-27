// src/pages/learn/SkillTree.tsx
import {useEffect, useState} from 'react';
import type {Instrument, LoadedUnit} from '@/lib/curriculum/types';
import {loadAllUnits} from '@/lib/curriculum/loader';
import {getCompletedLessons} from '@/lib/local-db/learn';
import UnitNode from './UnitNode';

interface SkillTreeProps {
  instrument: Instrument;
}

export default function SkillTree({instrument}: SkillTreeProps) {
  const [units, setUnits] = useState<LoadedUnit[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedUnitId(null);
    Promise.all([
      loadAllUnits(instrument),
      getCompletedLessons(instrument),
    ]).then(([loadedUnits, progress]) => {
      setUnits(loadedUnits);
      setCompletedLessonIds(new Set(progress.map(p => `${p.unitId}/${p.lessonId}`)));
      // Auto-expand first incomplete unit
      const firstIncomplete = loadedUnits.find(u =>
        u.lessons.some(l => !progress.find(p => p.unitId === u.id && p.lessonId === l)),
      );
      setExpandedUnitId(firstIncomplete?.id ?? loadedUnits[0]?.id ?? null);
    }).catch(err => setError(String(err))).finally(() => setLoading(false));
  }, [instrument]);

  const completedUnitIds = new Set(
    units
      .filter(u => u.lessons.every(l => completedLessonIds.has(`${u.id}/${l}`)))
      .map(u => u.id),
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-on-surface-variant text-sm">Loading curriculum…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-500 text-sm">Failed to load curriculum: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {units.map(unit => (
        <UnitNode
          key={unit.id}
          unit={unit}
          instrument={instrument}
          completedLessonIds={completedLessonIds}
          completedUnitIds={completedUnitIds}
          isExpanded={expandedUnitId === unit.id}
          onToggle={() =>
            setExpandedUnitId(prev => (prev === unit.id ? null : unit.id))
          }
        />
      ))}
    </div>
  );
}
