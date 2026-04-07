import {Link} from 'react-router-dom';
import {
  ListMusic,
  FolderHeart,
  History,
  ChevronRight,
} from 'lucide-react';

const FEATURES = [
  {
    name: 'Setlists',
    desc: 'Create and manage ordered playlists of charts. Set speed, reorder songs, and export for Clone Hero or YARG.',
    icon: ListMusic,
    href: '/library/setlists',
    accent: 'bg-primary/10 text-primary',
    cta: 'Manage Setlists',
    ctaClass: 'bg-primary-container text-on-primary-container',
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
    name: 'Practice History',
    desc: 'Review past sessions, track your progress across instruments.',
    icon: History,
    accent: 'bg-on-surface-variant/10 text-on-surface-variant',
    placeholder: true,
  },
];

export default function LibraryPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        <header className="space-y-2">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Library
          </h1>
          <p className="text-on-surface-variant text-base max-w-xl leading-relaxed">
            Manage your collections, setlists, and practice history.
          </p>
        </header>

        <section className="space-y-4">
          <p className="text-xs font-mono font-semibold tracking-[0.2em] uppercase text-outline">
            Your Collection
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FEATURES.map(feature => {
              const Icon = feature.icon;
              const isPlaceholder = 'placeholder' in feature && feature.placeholder;

              const card = (
                <div
                  key={feature.name}
                  className={`bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 ${
                    isPlaceholder ? 'opacity-50 select-none' : 'group'
                  } ${feature.name === 'Setlists' ? 'md:col-span-2' : ''}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                    <div className={`flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center ${feature.accent}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-headline font-bold text-lg text-on-surface">{feature.name}</h3>
                        <p className="text-on-surface-variant text-sm mt-1 leading-relaxed">{feature.desc}</p>
                      </div>
                      {!isPlaceholder && 'cta' in feature && (
                        <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${feature.ctaClass || 'text-primary'}`}>
                          {feature.cta} <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {isPlaceholder && (
                        <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-outline">
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
