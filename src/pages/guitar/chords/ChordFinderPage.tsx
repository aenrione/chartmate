import {useState, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {Search, ChevronRight, ArrowLeft} from 'lucide-react';
import {CHORD_LIBRARY, searchChords, getDisplayName, type ChordDefinition} from './chordVoicings';
import {NOTES} from '../fretboard/lib/musicTheory';
import ChordDiagram from './ChordDiagram';

const SUFFIX_FILTERS = [
  {value: '', label: 'All'},
  {value: 'major', label: 'Major'},
  {value: 'm', label: 'Minor'},
  {value: '7', label: '7'},
  {value: 'maj7', label: 'Maj7'},
  {value: 'm7', label: 'm7'},
  {value: 'sus2', label: 'Sus2'},
  {value: 'sus4', label: 'Sus4'},
  {value: 'dim', label: 'Dim'},
  {value: 'aug', label: 'Aug'},
] as const;

export default function ChordFinderPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rootFilter, setRootFilter] = useState('');
  const [suffixFilter, setSuffixFilter] = useState('');
  const [expandedChord, setExpandedChord] = useState<string | null>(null);

  const filteredChords = useMemo(() => {
    let results: ChordDefinition[];

    if (query.trim()) {
      results = searchChords(query);
    } else {
      results = [...CHORD_LIBRARY];
    }

    if (rootFilter) {
      results = results.filter(c => c.root === rootFilter);
    }

    if (suffixFilter) {
      if (suffixFilter === 'major') {
        results = results.filter(c => c.suffix === '');
      } else {
        results = results.filter(c => c.suffix === suffixFilter);
      }
    }

    return results;
  }, [query, rootFilter, suffixFilter]);

  // Group by chord name for display
  const grouped = useMemo(() => {
    if (expandedChord) {
      const chord = filteredChords.find(c => c.name === expandedChord);
      return chord ? [chord] : [];
    }
    return filteredChords;
  }, [filteredChords, expandedChord]);

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <button onClick={() => navigate('/guitar')} className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            Guitar
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
          <span className="text-secondary font-medium">Chord Finder</span>
        </nav>

        {/* Header */}
        <header className="space-y-2">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
            Chord Finder
          </h1>
          <p className="text-on-surface-variant text-sm max-w-xl leading-relaxed">
            Search and explore chord voicings across the fretboard. Tap a chord to see all positions.
          </p>
        </header>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setExpandedChord(null);
            }}
            placeholder="Search chords... (e.g. Am, F#m7, Cmaj7, minor)"
            className="w-full h-12 pl-12 pr-4 bg-surface-container-low border border-white/[0.06] rounded-xl text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/40 focus:ring-1 focus:ring-secondary/20 transition-all text-base"
          />
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {/* Root note filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono uppercase tracking-wider text-outline mr-1">Root</span>
            <button
              onClick={() => { setRootFilter(''); setExpandedChord(null); }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                !rootFilter
                  ? 'bg-secondary text-black'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              All
            </button>
            {NOTES.map(note => (
              <button
                key={note}
                onClick={() => { setRootFilter(rootFilter === note ? '' : note); setExpandedChord(null); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  rootFilter === note
                    ? 'bg-secondary text-black'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {note}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono uppercase tracking-wider text-outline mr-1">Type</span>
            {SUFFIX_FILTERS.map(sf => (
              <button
                key={sf.value}
                onClick={() => { setSuffixFilter(suffixFilter === sf.value ? '' : sf.value); setExpandedChord(null); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  suffixFilter === sf.value
                    ? 'bg-secondary text-black'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Back button when expanded */}
        {expandedChord && (
          <button
            onClick={() => setExpandedChord(null)}
            className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-secondary/80 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all chords
          </button>
        )}

        {/* Results */}
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-on-surface-variant text-sm">
              {query || rootFilter || suffixFilter ? 'No chords match your search.' : 'Type a chord name to get started.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(chord => (
              <section key={chord.name} className="space-y-3">
                {/* Chord title */}
                <div className="flex items-center gap-3">
                  <h2 className="font-headline font-bold text-lg text-on-surface">
                    {getDisplayName(chord)}
                  </h2>
                  {!expandedChord && chord.voicings.length > 1 && (
                    <button
                      onClick={() => setExpandedChord(chord.name)}
                      className="text-xs text-secondary hover:text-secondary/80 transition-colors cursor-pointer"
                    >
                      {chord.voicings.length} voicings
                    </button>
                  )}
                </div>

                {/* Voicing grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {(expandedChord === chord.name ? chord.voicings : chord.voicings.slice(0, 1)).map(
                    (voicing, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (!expandedChord) setExpandedChord(chord.name);
                        }}
                        className="cursor-pointer"
                      >
                        <ChordDiagram
                          voicing={voicing}
                          highlight={i === 0 && expandedChord === chord.name}
                        />
                      </button>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
