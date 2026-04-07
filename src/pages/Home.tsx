import { Link } from 'react-router-dom';
import { Drum, Guitar, ArrowRight } from 'lucide-react';

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
  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6 md:p-12">
      {/* Status indicator */}
      <div className="mb-8 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-container opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-container" />
        </span>
        <span className="font-mono text-xs uppercase tracking-widest text-on-surface-variant">
          Ready for session
        </span>
      </div>

      {/* Headline */}
      <h1 className="font-headline text-4xl md:text-5xl font-bold text-on-surface mb-3">
        Pick your instrument
      </h1>
      <p className="text-on-surface-variant text-lg max-w-xl mb-12">
        Choose an instrument to explore tools, practice routines, and charts
        tailored to your workflow.
      </p>

      {/* Instrument cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {instruments.map((inst) => (
          <Link
            key={inst.name}
            to={inst.to}
            className="group relative flex flex-col h-[320px] rounded-2xl bg-surface-container-low overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:bg-surface-container"
          >
            {/* Top accent stripe */}
            <div className={`h-1 w-full ${inst.accent}`} />

            {/* Large decorative background icon */}
            <inst.icon
              className={`pointer-events-none absolute -right-6 -bottom-6 h-52 w-52 ${inst.accentText} opacity-[0.06]`}
              strokeWidth={1}
            />

            {/* Card content */}
            <div className="relative flex flex-1 flex-col justify-between p-6">
              <div>
                <inst.icon className={`h-10 w-10 ${inst.accentText} mb-4`} strokeWidth={1.5} />
                <h2 className="font-headline text-2xl font-semibold text-on-surface">
                  {inst.name}
                </h2>
                <span className="font-mono text-sm text-on-surface-variant">
                  {inst.tools} tools available
                </span>
              </div>

              {/* CTA - revealed on hover */}
              <div className="flex items-center gap-2 text-primary opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
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
