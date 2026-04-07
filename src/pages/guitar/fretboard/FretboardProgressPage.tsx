import {useState} from 'react';
import {TrendingUp, AlertTriangle} from 'lucide-react';
import {usePositionStats} from './hooks/useProgress';
import FretboardHeatMap from './components/FretboardHeatMap';

type TimePeriod = '7d' | '30d' | 'all';
type FretRange = 'full' | 'open' | 'mid' | 'high';
type StringSet = 'all' | 'bass' | 'treble';

const FRET_RANGES: Record<FretRange, [number, number]> = {
  full: [0, 22],
  open: [0, 5],
  mid: [5, 12],
  high: [12, 22],
};

const STRING_RANGES: Record<StringSet, [number, number]> = {
  all: [0, 5],
  bass: [3, 5],
  treble: [0, 2],
};

export default function FretboardProgressPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d');
  const [fretRange, setFretRange] = useState<FretRange>('full');
  const [stringSet, setStringSet] = useState<StringSet>('all');
  const {stats, loading} = usePositionStats();

  // Calculate insights
  const totalPositions = stats.length;
  const greenCount = stats.filter(s => s.accuracy >= 0.75).length;
  const amberCount = stats.filter(s => s.accuracy >= 0.4 && s.accuracy < 0.75).length;
  const redCount = stats.filter(s => s.accuracy < 0.4).length;
  const greenPct = totalPositions > 0 ? Math.round((greenCount / totalPositions) * 100) : 0;
  const amberPct = totalPositions > 0 ? Math.round((amberCount / totalPositions) * 100) : 0;
  const redPct = totalPositions > 0 ? Math.round((redCount / totalPositions) * 100) : 0;

  // Find worst zone
  const worstPositions = [...stats]
    .filter(s => s.totalAttempts >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // Find best improving zone
  const bestPositions = [...stats]
    .filter(s => s.totalAttempts >= 5)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <section className="mb-12 flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold font-headline tracking-tight mb-4 text-on-surface">
            Heat Map View
          </h1>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            A technical visualization of your fretboard proficiency. Identify dead zones and mastery clusters across 22 frets.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-surface-container-highest/30 backdrop-blur-xl p-4 rounded-2xl flex flex-wrap gap-4 border border-outline-variant/10 shadow-2xl">
          <FilterGroup label="Time Period">
            {(['7d', '30d', 'all'] as const).map(period => (
              <button
                key={period}
                onClick={() => setTimePeriod(period)}
                className={`px-3 py-1 text-xs font-bold rounded-md ${
                  timePeriod === period
                    ? 'bg-secondary text-on-secondary-fixed'
                    : 'text-on-surface-variant/60 hover:text-on-surface'
                }`}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label="Fret Range">
            <select
              value={fretRange}
              onChange={e => setFretRange(e.target.value as FretRange)}
              className="bg-surface-container-low border-none text-xs font-bold rounded-lg py-2 focus:ring-0 text-on-surface cursor-pointer"
            >
              <option value="full">Full (0-22)</option>
              <option value="open">Open (0-5)</option>
              <option value="mid">Mid (5-12)</option>
              <option value="high">High (12-22)</option>
            </select>
          </FilterGroup>

          <FilterGroup label="String Set">
            <select
              value={stringSet}
              onChange={e => setStringSet(e.target.value as StringSet)}
              className="bg-surface-container-low border-none text-xs font-bold rounded-lg py-2 focus:ring-0 text-on-surface cursor-pointer"
            >
              <option value="all">All Strings</option>
              <option value="bass">E-A-D (Bass)</option>
              <option value="treble">G-B-E (Treble)</option>
            </select>
          </FilterGroup>
        </div>
      </section>

      {/* Legend */}
      <div className="mb-8 flex items-center gap-6 justify-end">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-on-surface-variant/60 uppercase font-bold tracking-widest">
            Accuracy Spectrum
          </span>
          <div className="flex h-2 w-48 rounded-full overflow-hidden bg-surface-container-low">
            <div className="h-full w-1/3 bg-error-container" />
            <div className="h-full w-1/3 bg-tertiary-container" />
            <div className="h-full w-1/3 bg-secondary-container" />
          </div>
        </div>
      </div>

      {/* Heat Map */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">Loading...</div>
      ) : (
        <FretboardHeatMap
          stats={stats}
          fretRange={FRET_RANGES[fretRange]}
          stringRange={STRING_RANGES[stringSet]}
        />
      )}

      {/* Insights */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Growth Corridor */}
        {bestPositions.length > 0 && (
          <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 hover:bg-surface-container transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-secondary" />
              </div>
              <h3 className="font-bold font-headline">Growth Corridor</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Your strongest positions are around{' '}
              <span className="text-secondary font-bold">
                fret {bestPositions[0].fret}
              </span>{' '}
              with{' '}
              <span className="text-secondary font-bold">
                {Math.round(bestPositions[0].accuracy * 100)}%
              </span>{' '}
              accuracy.
            </p>
          </div>
        )}

        {/* Dead Zone */}
        {worstPositions.length > 0 && (
          <div className="bg-surface-container-low p-6 rounded-3xl border border-error/10 hover:bg-surface-container transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-error/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-error" />
              </div>
              <h3 className="font-bold font-headline">Dead Zone Detected</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Positions around{' '}
              <span className="text-error font-bold">
                fret {worstPositions[0].fret}
              </span>{' '}
              need work at only{' '}
              <span className="text-error font-bold">
                {Math.round(worstPositions[0].accuracy * 100)}%
              </span>{' '}
              accuracy.
            </p>
          </div>
        )}

        {/* Mastery Breakdown */}
        <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 hover:bg-surface-container transition-all">
          <h3 className="font-bold font-headline mb-6">Fretboard Mastery</h3>
          <div className="space-y-4">
            <ProgressBar label="Green Zone" value={greenPct} color="bg-secondary" />
            <ProgressBar label="Amber Zone" value={amberPct} color="bg-tertiary" />
            <ProgressBar label="Red Zone" value={redPct} color="bg-error" />
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterGroup({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-secondary font-bold px-1">
        {label}
      </span>
      <div className="flex bg-surface-container-low rounded-lg p-1">{children}</div>
    </div>
  );
}

function ProgressBar({label, value, color}: {label: string; value: number; color: string}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold mb-2">
        <span className="text-on-surface-variant/60">{label}</span>
        <span className={color.replace('bg-', 'text-')}>{value}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{width: `${value}%`}} />
      </div>
    </div>
  );
}
