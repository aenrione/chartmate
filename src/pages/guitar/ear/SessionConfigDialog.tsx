// src/pages/guitar/ear/SessionConfigDialog.tsx
import * as Dialog from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
import {useState} from 'react';
import {cn} from '@/lib/utils';
import type {EarConfig, ExerciseDescriptor} from './exercises/types';
import {DEFAULT_EAR_CONFIG} from './exercises/types';

interface Props {
  descriptor: ExerciseDescriptor;
  open: boolean;
  onLaunch: (config: EarConfig) => void;
  onCancel: () => void;
}

const QUESTION_COUNTS = [5, 10, 20, 40];

export function SessionConfigDialog({descriptor, open, onLaunch, onCancel}: Props) {
  const [config, setConfig] = useState<EarConfig>(DEFAULT_EAR_CONFIG);

  const supportsHarmonic = ['interval-recognition', 'chord-recognition', 'chord-progressions', 'intervals-in-context'].includes(descriptor.type);
  const supportsDirection = ['interval-recognition', 'intervals-in-context', 'scale-degrees'].includes(descriptor.type);

  function toggle<K extends keyof EarConfig>(key: K, value: EarConfig[K]) {
    setConfig(c => ({...c, [key]: value}));
  }

  function toggleScope(option: string) {
    setConfig(c => {
      const s = c.scope.includes(option) ? c.scope.filter(x => x !== option) : [...c.scope, option];
      return {...c, scope: s};
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface-container p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-bold text-on-surface">Session Config</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 hover:bg-surface-container-high text-on-surface-variant">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-5">
            {/* Question count */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Question Count</label>
              <div className="mt-2 flex gap-2">
                {QUESTION_COUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => toggle('questionCount', n)}
                    className={cn(
                      'flex-1 rounded-2xl py-2 text-sm font-medium transition-colors',
                      config.questionCount === n
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback mode */}
            {supportsHarmonic && (
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Playback Mode</label>
                <div className="mt-2 flex gap-2">
                  {(['melodic', 'harmonic'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => toggle('playbackMode', mode)}
                      className={cn(
                        'flex-1 rounded-2xl py-2 text-sm font-medium capitalize transition-colors',
                        config.playbackMode === mode
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Speed */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Speed</label>
              <div className="mt-2 flex gap-2">
                {(['slow', 'medium', 'fast'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => toggle('speed', s)}
                    className={cn(
                      'flex-1 rounded-2xl py-2 text-sm font-medium capitalize',
                      config.speed === s ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            {supportsDirection && (
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Direction</label>
                <div className="mt-2 flex gap-2">
                  {(['ascending', 'descending', 'both'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => toggle('direction', d)}
                      className={cn(
                        'flex-1 rounded-2xl py-2 text-sm font-medium capitalize',
                        config.direction === d ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toggles */}
            <div className="flex flex-col gap-3">
              {[
                {key: 'fixedRoot' as const, label: 'Fixed Root', desc: 'Always start from C'},
                {key: 'autoAdvance' as const, label: 'Auto-advance', desc: 'Skip to next on correct'},
              ].map(({key, label, desc}) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-on-surface">{label}</p>
                    <p className="text-xs text-on-surface-variant">{desc}</p>
                  </div>
                  <button
                    onClick={() => toggle(key, !config[key])}
                    className={cn(
                      'h-6 w-11 rounded-full transition-colors',
                      config[key] ? 'bg-primary' : 'bg-surface-container-highest',
                    )}
                  >
                    <span
                      className={cn(
                        'block h-5 w-5 rounded-full bg-white shadow transition-transform mx-0.5',
                        config[key] ? 'translate-x-5' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Scope */}
            {descriptor.allOptions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                    Scope
                  </label>
                  <button
                    onClick={() => toggle('scope', [])}
                    className="text-xs text-primary hover:underline"
                  >
                    Select All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {descriptor.allOptions.map(opt => {
                    const active = config.scope.length === 0 || config.scope.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => toggleScope(opt)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs transition-colors',
                          active ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant',
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-full py-3 text-sm font-medium bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
            >
              Cancel
            </button>
            <button
              onClick={() => onLaunch(config)}
              className="flex-1 rounded-full py-3 text-sm font-semibold bg-primary text-on-primary hover:bg-primary/90"
            >
              Launch Session
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
