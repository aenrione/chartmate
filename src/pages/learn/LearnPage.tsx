// src/pages/learn/LearnPage.tsx
import {useState} from 'react';
import {Guitar, Drum, Music, LayoutList, GitBranch, Target, Award} from 'lucide-react';
import {Link} from 'react-router-dom';
import {cn} from '@/lib/utils';
import type {Instrument} from '@/lib/curriculum/types';
import SkillTree, {type SkillTreeView} from './SkillTree';
import LearnStats from './LearnStats';
import MissionBoard from './MissionBoard';
import TodayCard from './TodayCard';
import UpcomingSessionsWidget from '@/components/programs/UpcomingSessionsWidget';

const INSTRUMENTS: {label: string; value: Instrument; Icon: React.ElementType}[] = [
  {label: 'Guitar', value: 'guitar', Icon: Guitar},
  {label: 'Drums', value: 'drums', Icon: Drum},
  {label: 'Music Theory', value: 'theory', Icon: Music},
];

export default function LearnPage() {
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [view, setView] = useState<SkillTreeView>('path');
  const [missionBoardOpen, setMissionBoardOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <UpcomingSessionsWidget />

      {/* Header: instrument switcher + view toggle */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-outline-variant/20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold font-headline">Learn</h1>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMissionBoardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
              title="Mission board"
            >
              <Target className="h-4 w-4" />
              <span>Missions</span>
            </button>

            <Link
              to="/learn/achievements"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
              title="Achievements"
            >
              <Award className="h-4 w-4" />
              <span>Trophies</span>
            </Link>

            {/* View toggle */}
            <div className="flex items-center bg-surface-container rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setView('path')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  view === 'path'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
                title="Path view"
              >
                <GitBranch className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  view === 'list'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
                title="List view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Instrument switcher */}
        <div className="flex gap-2">
          {INSTRUMENTS.map(({label, value, Icon}) => (
            <button
              key={value}
              onClick={() => setInstrument(value)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors',
                instrument === value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Today card */}
      <TodayCard
        instrument={instrument}
        onOpenMissionBoard={() => setMissionBoardOpen(true)}
      />

      {/* Stats bar */}
      <LearnStats />

      {/* Skill tree */}
      <SkillTree instrument={instrument} view={view} />

      <MissionBoard open={missionBoardOpen} onClose={() => setMissionBoardOpen(false)} />
    </div>
  );
}
