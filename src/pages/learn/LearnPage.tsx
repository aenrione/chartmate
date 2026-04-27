// src/pages/learn/LearnPage.tsx
import {useState} from 'react';
import {Guitar, Drum} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Instrument} from '@/lib/curriculum/types';
import SkillTree from './SkillTree';
import LearnStats from './LearnStats';
import UpcomingSessionsWidget from '@/components/programs/UpcomingSessionsWidget';

const INSTRUMENTS: {label: string; value: Instrument; Icon: React.ElementType}[] = [
  {label: 'Guitar', value: 'guitar', Icon: Guitar},
  {label: 'Drums', value: 'drums', Icon: Drum},
];

export default function LearnPage() {
  const [instrument, setInstrument] = useState<Instrument>('guitar');

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <UpcomingSessionsWidget />
      {/* Instrument switcher */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-outline-variant/20">
        <h1 className="text-xl font-bold font-headline mb-4">Learn</h1>
        <div className="flex gap-2">
          {INSTRUMENTS.map(({label, value, Icon}) => (
            <button
              key={value}
              onClick={() => setInstrument(value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors',
                instrument === value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <LearnStats />

      {/* Skill tree */}
      <SkillTree instrument={instrument} />
    </div>
  );
}
