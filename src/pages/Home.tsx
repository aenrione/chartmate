import { Link } from 'react-router-dom';
import { Drum, Guitar, ArrowRight } from 'lucide-react';
import {useMobilePageTitle} from '@/contexts/LayoutContext';

const instruments = [
  {
    name: 'Drums',
    icon: Drum,
    tools: 4,
    to: '/sheet-music',
    accent: 'bg-tertiary-container',
    accentText: 'text-tertiary',
  },
  {
    name: 'Guitar',
    icon: Guitar,
    tools: 2,
    to: '/guitar',
    accent: 'bg-secondary-container',
    accentText: 'text-secondary',
  },
] as const;

export default function Home() {
  useMobilePageTitle('Practice');
  return (
    <div className="flex-1 overflow-y-auto bg-surface p-4 lg:p-6 xl:p-12 max-lg:landscape:p-4">
      {/* Status indicator */}
      <div className="mb-8 flex items-center gap-2 hidden lg:flex">
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
      <p className="text-on-surface-variant text-lg max-w-xl mb-12 hidden lg:block">
        Choose an instrument to explore tools, practice routines, and charts
        tailored to your workflow.
      </p>

      {/* Instrument cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl max-lg:landscape:gap-3 max-lg:landscape:grid-cols-2">
        {instruments.map((inst) => (
          <Link
            key={inst.name}
            to={inst.to}
            className="group relative flex flex-col h-[180px] lg:h-[320px] max-lg:landscape:h-[130px] rounded-2xl bg-surface-container-low overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:bg-surface-container"
          >
            {/* Top accent stripe */}
            <div className={`h-1 w-full ${inst.accent}`} />

            {/* Large decorative background icon */}
            <inst.icon
              className={`pointer-events-none absolute -right-6 -bottom-6 h-52 w-52 max-lg:landscape:h-28 max-lg:landscape:w-28 ${inst.accentText} opacity-[0.06]`}
              strokeWidth={1}
            />

            {/* Card content */}
            <div className="relative flex flex-1 flex-col justify-between p-6 max-lg:landscape:p-3">
              <div>
                <inst.icon className={`h-10 w-10 max-lg:landscape:h-6 max-lg:landscape:w-6 ${inst.accentText} mb-4 max-lg:landscape:mb-1`} strokeWidth={1.5} />
                <h2 className="font-headline text-2xl max-lg:landscape:text-base font-semibold text-on-surface">
                  {inst.name}
                </h2>
                <span className="font-mono text-sm max-lg:landscape:text-xs text-on-surface-variant">
                  {inst.tools} tools available
                </span>
              </div>

              {/* CTA - revealed on hover */}
              <div className="flex items-center gap-2 text-primary opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 max-lg:landscape:hidden">
                <span className="font-mono text-sm">Start session</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
