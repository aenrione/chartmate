// src/pages/learn/LearnPage.tsx
import {useState} from 'react';
import {Guitar, Drum, Music, LayoutList, GitBranch, Target, Award, LayoutDashboard, X} from 'lucide-react';
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
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <UpcomingSessionsWidget />

      {/* Header: instrument switcher + view toggle */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-outline-variant/20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold font-headline hidden lg:block">Learn</h1>

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

            {/* Mobile stats toggle */}
            <button
              onClick={() => setStatsPanelOpen(true)}
              className="lg:hidden p-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
              title="Today's stats"
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
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

      {/* Today card + stats — always visible on desktop, hidden on mobile */}
      <div className="hidden lg:contents">
        <TodayCard
          instrument={instrument}
          onOpenMissionBoard={() => setMissionBoardOpen(true)}
        />
        <LearnStats />
      </div>

      {/* Skill tree — gets full height on mobile */}
      <SkillTree instrument={instrument} view={view} />

      {/* Mobile stats bottom sheet */}
      {statsPanelOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setStatsPanelOpen(false)}
          />
          <div
            className="lg:hidden fixed bottom-0 z-50 bg-surface rounded-t-2xl border-t border-outline-variant/20 max-h-[80vh] overflow-y-auto"
            style={{
              left: 'env(safe-area-inset-left, 0px)',
              right: 'env(safe-area-inset-right, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-outline-variant/40" />
            </div>
            <div className="flex justify-end px-4 pb-1">
              <button
                onClick={() => setStatsPanelOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <TodayCard
              instrument={instrument}
              onOpenMissionBoard={() => { setStatsPanelOpen(false); setMissionBoardOpen(true); }}
            />
            <LearnStats />
          </div>
        </>
      )}

      <MissionBoard open={missionBoardOpen} onClose={() => setMissionBoardOpen(false)} />
    </div>
  );
}
