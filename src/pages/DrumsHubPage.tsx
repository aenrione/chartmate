import {Link} from 'react-router-dom';
import {
  Music,
  BookOpen,
  Zap,
  Target,
  ChevronRight,
} from 'lucide-react';

export default function DrumsHubPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-on-surface-variant">Practice</span>
          <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
          <span className="text-tertiary font-medium">Drums</span>
        </nav>

        {/* Hero */}
        <header className="space-y-2">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Drums Hub
          </h1>
          <p className="text-on-surface-variant text-base max-w-xl leading-relaxed">
            Your drumming command center. Read sheet music, master rudiments, and build rock-solid
            chops -- all in one place.
          </p>
        </header>

        {/* Tools Section */}
        <section className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-outline">
            Drummer Toolbox
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Sheet Music Viewer -- primary tool, spans 2 cols */}
            <Link
              to="/sheet-music/search"
              className="md:col-span-2 bg-surface-container-low rounded-xl p-6 border border-tertiary-container/20 hover:bg-surface-container transition-all cursor-pointer hover:scale-[1.02] group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <Music className="h-6 w-6 text-tertiary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-surface">Sheet Music Viewer</h3>
                    <p className="text-on-surface-variant text-sm mt-1 leading-relaxed">
                      Browse and view drum sheet music. Search for songs, follow along with notation,
                      and practice your reading skills.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-tertiary">
                    Browse Sheet Music
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </div>
              </div>
            </Link>

            {/* Rudiments Library */}
            <Link
              to="/rudiments"
              className="bg-surface-container-low rounded-xl p-5 border border-tertiary-container/20 hover:bg-surface-container transition-all cursor-pointer hover:scale-[1.02] group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-tertiary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Rudiments Library</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">
                    Essential drum rudiments with notation and audio
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-tertiary">
                    40 rudiments
                  </span>
                </div>
              </div>
            </Link>

            {/* Fill Trainer */}
            <Link
              to="/fills"
              className="bg-surface-container-low rounded-xl p-5 border border-tertiary-container/20 hover:bg-surface-container transition-all cursor-pointer hover:scale-[1.02] group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-tertiary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Fill Trainer</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Famous fills from legendary drummers</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-tertiary">
                    18 fills
                  </span>
                </div>
              </div>
            </Link>

            {/* Pad Exercises -- placeholder */}
            <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 opacity-60 select-none">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-outline-variant/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-on-surface-variant" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Pad Exercises</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Stick control & hand technique</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-outline">
                    Coming soon
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
