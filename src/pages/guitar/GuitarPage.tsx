import {useState, useEffect} from 'react';
import {useNavigate, Link} from 'react-router-dom';
import {
  FileMusic,
  Grid3X3,
  Dumbbell,
  Speaker,
  Music,
  Waves,
  ChevronRight,
  BookMarked,
  Library,
  PenTool,
} from 'lucide-react';
import {getRepertoireStats} from '@/lib/local-db/repertoire';
import {getRecentCompositions, type TabComposition} from '@/lib/local-db/tab-compositions';
import {useMobilePageTitle} from '@/contexts/LayoutContext';

export default function GuitarPage() {
  useMobilePageTitle('Guitar');
  const navigate = useNavigate();
  const [repertoireDue, setRepertoireDue] = useState<number | null>(null);
  const [recentCompositions, setRecentCompositions] = useState<TabComposition[]>([]);

  useEffect(() => {
    getRepertoireStats()
      .then(s => setRepertoireDue(s.dueToday))
      .catch(() => setRepertoireDue(null));
  }, []);

  useEffect(() => {
    getRecentCompositions('guitar', 5)
      .then(setRecentCompositions)
      .catch(() => setRecentCompositions([]));
  }, []);


  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 max-lg:landscape:py-4 space-y-10 max-lg:landscape:space-y-5">

        {/* Breadcrumb */}
        <nav className="hidden lg:flex items-center gap-1.5 text-sm">
          <span className="text-on-surface-variant">Practice</span>
          <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
          <span className="text-secondary font-medium">Guitar</span>
        </nav>

        {/* Hero */}
        <header className="space-y-2 hidden lg:block">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Guitar Hub
          </h1>
          <p className="text-on-surface-variant text-base max-w-xl leading-relaxed">
            Your practice headquarters. Open tabs, explore the fretboard, and sharpen your technique -- all in one place.
          </p>
        </header>

        {/* Tools Section */}
        <section className="space-y-4">
          <p className="text-xs font-mono font-semibold tracking-[0.2em] uppercase text-outline hidden lg:block">
            Guitarist Toolbox
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tab Editor -- primary tool, spans 2 cols */}
            <Link
              to="/tab-editor"
              className="md:col-span-2 bg-surface-container-low rounded-xl p-4 lg:p-6 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer hover:scale-[1.02] group"
            >
              <div className="flex flex-row items-center gap-3 lg:flex-col lg:items-start lg:gap-5">
                <div className="flex-shrink-0 h-9 w-9 lg:h-12 lg:w-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <PenTool className="h-5 w-5 lg:h-6 lg:w-6 text-secondary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-headline font-bold text-base lg:text-lg text-on-surface">Tab Editor</h3>
                    <p className="text-on-surface-variant text-xs mt-0.5 lg:hidden">Create & edit guitar tabs</p>
                    <p className="text-on-surface-variant text-sm mt-1 leading-relaxed hidden lg:block">
                      Create and edit guitar tablature. Open tabs from Browse, import ASCII, or start from scratch.
                    </p>
                  </div>
                  <span className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
                    Open Editor
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </div>
              </div>
            </Link>

            {/* Fretboard IQ -- Active */}
            <button
              onClick={() => navigate('/guitar/fretboard')}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
                  <Grid3X3 className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Fretboard IQ</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Note recognition drills & fretboard mastery</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                    6 drills available
                  </span>
                </div>
              </div>
            </button>

            {/* Chord Finder -- Active */}
            <button
              onClick={() => navigate('/guitar/chords')}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
                  <Music className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Chord Finder</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Search voicings & chord shapes</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                    120+ voicings
                  </span>
                </div>
              </div>
            </button>

            {/* EarIQ -- Active */}
            <button
              onClick={() => navigate('/guitar/ear')}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
                  <Waves className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">EarIQ</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Interval, chord & scale ear training</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                    8 exercises
                  </span>
                </div>
              </div>
            </button>

            {/* RepertoireIQ -- Active */}
            <button
              onClick={() => navigate('/guitar/repertoire')}
              className="bg-surface-container-low rounded-xl p-5 border border-tertiary/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <BookMarked className="h-5 w-5 text-tertiary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">RepertoireIQ</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Spaced repetition for your repertoire</p>
                  {repertoireDue !== null && (
                    <span className={`inline-block mt-2 text-[10px] font-mono uppercase tracking-wider ${repertoireDue > 0 ? 'text-tertiary' : 'text-outline'}`}>
                      {repertoireDue > 0 ? `${repertoireDue} due today` : 'All caught up'}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Saved Charts */}
            <Link
              to="/library/saved-charts"
              state={{activeTab: 'guitar'}}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Library className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Saved Charts</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Your offline guitar tab collection</p>
                </div>
              </div>
            </Link>

            {/* Placeholder cards -- future tools */}
            {[
              {icon: Dumbbell, name: 'Technique Drills', desc: 'Speed & accuracy exercises'},
              {icon: Speaker, name: 'Tone Studio', desc: 'Amp & effects chain'},
            ].map(tool => (
              <div
                key={tool.name}
                className="bg-surface-container-low rounded-xl p-5 border border-white/[0.04] opacity-60 select-none"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <tool.icon className="h-5 w-5 text-on-surface-variant" />
                  </div>
                  <div>
                    <h3 className="font-headline font-semibold text-sm text-on-surface">{tool.name}</h3>
                    <p className="text-on-surface-variant text-xs mt-0.5">{tool.desc}</p>
                    <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-outline">
                      Coming soon
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* Recent Saved Charts */}
        {recentCompositions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-on-surface-variant" />
                <h2 className="font-headline font-bold text-on-surface text-base">
                  Recent Saved Charts
                </h2>
              </div>
              <Link
                to="/library/saved-charts"
                state={{activeTab: 'guitar'}}
                className="text-xs text-secondary hover:text-secondary/80 transition-colors"
              >
                View all
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recentCompositions.map(comp => (
                <Link
                  key={comp.id}
                  to={`/tab-editor/${comp.id}`}
                  className="bg-surface-container rounded-lg px-4 py-3 border border-white/[0.04] group hover:border-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileMusic className="h-4 w-4 flex-shrink-0 text-on-surface-variant" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {comp.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                        {comp.artist || 'Unknown Artist'}
                        {comp.tempo ? (
                          <>
                            <span className="mx-1.5 text-outline">|</span>
                            <span className="text-outline">{comp.tempo} bpm</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
