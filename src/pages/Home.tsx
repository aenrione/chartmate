import { Link } from 'react-router-dom';
import {
  Drum,
  Guitar,
  ArrowRight,
  Layers,
  PenTool,
  GraduationCap,
  Library,
  Search,
  CalendarDays,
} from 'lucide-react';
import {useMobilePageTitle} from '@/contexts/LayoutContext';

/**
 * The three ways a session starts. They share a grid so the row fills the
 * width instead of leaving Programs stranded under a two-column block.
 */
const primary = [
  {
    name: 'Drums',
    icon: Drum,
    hint: '4 tools available',
    cta: 'Start session',
    to: '/sheet-music',
    accent: 'bg-tertiary-container',
    accentText: 'text-tertiary',
  },
  {
    name: 'Guitar',
    icon: Guitar,
    hint: '2 tools available',
    cta: 'Start session',
    to: '/guitar',
    accent: 'bg-secondary-container',
    accentText: 'text-secondary',
  },
  {
    name: 'Programs',
    icon: Layers,
    hint: 'Structured practice plans',
    cta: 'Browse programs',
    to: '/programs',
    accent: 'bg-primary-container',
    accentText: 'text-primary',
  },
] as const;

/** Everything that isn't picking up an instrument. Pure navigation, no data. */
const shortcuts = [
  {name: 'Tab Editor', icon: PenTool, hint: 'Write & edit tabs', to: '/tab-editor'},
  {name: 'Learn', icon: GraduationCap, hint: 'Lessons & skill tree', to: '/learn'},
  {name: 'Library', icon: Library, hint: 'Your charts & tabs', to: '/library'},
  {name: 'Browse', icon: Search, hint: 'Find charts & tabs', to: '/browse'},
  {name: 'Calendar', icon: CalendarDays, hint: 'Practice history', to: '/calendar'},
] as const;

export default function Home() {
  useMobilePageTitle('Practice');
  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto flex w-full min-h-full max-w-[1500px] flex-col p-4 lg:p-6 xl:p-10 max-lg:landscape:p-4">
        {/* Status indicator */}
        <div className="mb-6 items-center gap-2 hidden lg:flex">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-container opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-container" />
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-on-surface-variant">
            Ready for session
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-headline text-4xl md:text-5xl font-bold text-on-surface mb-3 hidden lg:block">
          Pick your instrument
        </h1>
        <p className="text-on-surface-variant text-lg max-w-xl mb-8 xl:mb-10 hidden lg:block">
          Choose an instrument to explore tools, practice routines, and charts
          tailored to your workflow.
        </p>

        {/* Primary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 lg:flex-1 lg:max-h-[560px] max-lg:landscape:gap-3 max-lg:landscape:grid-cols-2">
          {primary.map((item) => (
            <Link
              key={item.name}
              to={item.to}
              className="group relative flex flex-col h-[180px] lg:h-auto lg:min-h-[260px] max-lg:landscape:h-[130px] rounded-2xl bg-surface-container-low overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:bg-surface-container"
            >
              {/* Top accent stripe */}
              <div className={`h-1 w-full ${item.accent}`} />

              {/* Large decorative background icon */}
              <item.icon
                className={`pointer-events-none absolute -right-6 -bottom-6 h-52 w-52 max-lg:landscape:h-28 max-lg:landscape:w-28 ${item.accentText} opacity-[0.06]`}
                strokeWidth={1}
              />

              {/* Card content */}
              <div className="relative flex flex-1 flex-col justify-between p-6 max-lg:landscape:p-3">
                <div>
                  <item.icon className={`h-10 w-10 max-lg:landscape:h-6 max-lg:landscape:w-6 ${item.accentText} mb-4 max-lg:landscape:mb-1`} strokeWidth={1.5} />
                  <h2 className="font-headline text-2xl max-lg:landscape:text-base font-semibold text-on-surface">
                    {item.name}
                  </h2>
                  <span className="font-mono text-sm max-lg:landscape:text-xs text-on-surface-variant">
                    {item.hint}
                  </span>
                </div>

                {/* CTA - revealed on hover */}
                <div className="flex items-center gap-2 text-primary opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 max-lg:landscape:hidden">
                  <span className="font-mono text-sm">{item.cta}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Shortcuts to everything that isn't an instrument */}
        <div className="mt-6 xl:mt-8 shrink-0 max-lg:landscape:hidden">
          <h2 className="font-mono text-xs uppercase tracking-widest text-on-surface-variant mb-3">
            Jump back in
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
            {shortcuts.map((item) => (
              <Link
                key={item.name}
                to={item.to}
                className="group flex items-center gap-3 rounded-xl bg-surface-container-low p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface-container"
              >
                <item.icon
                  className="h-5 w-5 shrink-0 text-on-surface-variant transition-colors group-hover:text-primary"
                  strokeWidth={1.5}
                />
                <div className="min-w-0">
                  <div className="font-headline text-sm font-semibold text-on-surface truncate">
                    {item.name}
                  </div>
                  <div className="font-mono text-xs text-on-surface-variant truncate">
                    {item.hint}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
