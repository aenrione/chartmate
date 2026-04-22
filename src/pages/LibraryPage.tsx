import {Link} from 'react-router-dom';
import {
  ListMusic,
  FolderHeart,
  History,
  ChevronRight,
  FileText,
  BookMarked,
  PenTool,
} from 'lucide-react';
import {useMobilePageTitle} from '@/contexts/LayoutContext';

const FEATURES = [
  {
    name: 'Setlists',
    desc: 'Create and manage ordered playlists of charts. Set speed, reorder songs, and export for Clone Hero or YARG.',
    icon: ListMusic,
    href: '/library/setlists',
    accent: 'bg-primary/10 text-primary',
    cta: 'Manage Setlists',
    ctaClass: 'text-primary',
  },
  {
    name: 'Saved Charts',
    desc: 'Your offline collection of drum charts. Saved charts are stored on your device and open without internet.',
    icon: FolderHeart,
    href: '/library/saved-charts',
    accent: 'bg-tertiary/10 text-tertiary',
    cta: 'View Library',
    ctaClass: 'text-tertiary',
  },
  {
    name: 'PDF Library',
    desc: 'Manage your PDF sheet music collection. Point ChartMate at a folder and it will scan recursively, auto-match PDFs to saved charts, and let you view them in the playbook.',
    icon: FileText,
    href: '/library/pdf',
    accent: 'bg-secondary/10 text-secondary',
    cta: 'Manage PDFs',
    ctaClass: 'text-secondary',
  },
  {
    name: 'My Lists',
    desc: 'Tracks saved from Spotify Explorer. Build custom lists of songs you want to learn or revisit later.',
    icon: BookMarked,
    href: '/library/explorer-lists',
    accent: 'bg-primary/10 text-primary',
    cta: 'View Lists',
    ctaClass: 'text-primary',
  },
  {
    name: 'Tab Editor',
    desc: 'Create and edit guitar tablature. Build compositions, import ASCII tabs, and save your work offline.',
    shortDesc: 'Create & edit guitar tabs',
    icon: PenTool,
    href: '/tab-editor',
    accent: 'bg-secondary/10 text-secondary',
    cta: 'Open Editor',
    ctaClass: 'text-secondary',
  },
  {
    name: 'Practice History',
    desc: 'Review past sessions, track your progress across instruments.',
    icon: History,
    accent: 'bg-on-surface-variant/10 text-on-surface-variant',
    placeholder: true,
  },
];

export default function LibraryPage() {
  useMobilePageTitle('Library');
  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 max-lg:landscape:py-4 space-y-10 max-lg:landscape:space-y-5">
        <header className="space-y-2 hidden lg:block">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Library
          </h1>
          <p className="text-on-surface-variant text-base max-w-xl leading-relaxed">
            Manage your collections, setlists, and practice history.
          </p>
        </header>

        <section className="space-y-4">
          <p className="text-xs font-mono font-semibold tracking-[0.2em] uppercase text-outline hidden lg:block">
            Your Collection
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-lg:landscape:grid-cols-2 max-lg:landscape:gap-2">
            {FEATURES.map(feature => {
              const Icon = feature.icon;
              const isPlaceholder = 'placeholder' in feature && feature.placeholder;

              const card = (
                <div
                  key={feature.name}
                  className={`bg-surface-container-low rounded-xl p-4 lg:p-6 max-lg:landscape:p-3 border border-outline-variant/10 ${
                    isPlaceholder ? 'opacity-50 select-none' : 'group'
                  } ${feature.name === 'Setlists' ? 'md:col-span-2' : ''}`}
                >
                  <div className="flex flex-row items-center gap-3 lg:flex-col lg:items-start lg:gap-5 max-lg:landscape:flex-row max-lg:landscape:items-center max-lg:landscape:gap-3">
                    <div className={`flex-shrink-0 h-9 w-9 lg:h-12 lg:w-12 max-lg:landscape:h-8 max-lg:landscape:w-8 rounded-lg flex items-center justify-center ${feature.accent}`}>
                      <Icon className="h-4 w-4 lg:h-6 lg:w-6 max-lg:landscape:h-4 max-lg:landscape:w-4" />
                    </div>
                    <div className="flex-1 space-y-3 max-lg:landscape:space-y-0.5">
                      <div>
                        <h3 className="font-headline font-bold text-base lg:text-lg max-lg:landscape:text-sm text-on-surface">{feature.name}</h3>
                        {'shortDesc' in feature && feature.shortDesc && (
                          <p className="text-on-surface-variant text-xs mt-0.5 lg:hidden">{feature.shortDesc}</p>
                        )}
                        <p className="text-on-surface-variant text-sm mt-1 leading-relaxed hidden lg:block">{feature.desc}</p>
                      </div>
                      {!isPlaceholder && 'cta' in feature && (
                        <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest hidden lg:inline-flex ${feature.ctaClass || 'text-primary'}`}>
                          {feature.cta} <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {isPlaceholder && (
                        <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-outline hidden lg:inline-block">
                          Coming soon
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );

              if (!isPlaceholder && 'href' in feature && feature.href) {
                return <Link key={feature.name} to={feature.href} className="contents">{card}</Link>;
              }
              return card;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
