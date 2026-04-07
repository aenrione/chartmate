import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {cn} from '@/lib/utils';
import type {DrumNoteInstrument} from './drumTypes';
import {
  ALL_DRUM_INSTRUMENTS,
  DRUM_INSTRUMENT_LABELS,
} from './generateSyntheticDrumTrack';

interface SyntheticDrumControlsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  enabledInstruments: Set<DrumNoteInstrument>;
  onEnabledInstrumentsChange: (instruments: Set<DrumNoteInstrument>) => void;
}

export default function SyntheticDrumControls({
  enabled,
  onEnabledChange,
  volume,
  onVolumeChange,
  enabledInstruments,
  onEnabledInstrumentsChange,
}: SyntheticDrumControlsProps) {
  const allEnabled =
    enabledInstruments.size === ALL_DRUM_INSTRUMENTS.length;

  const toggleInstrument = (inst: DrumNoteInstrument, checked: boolean) => {
    const next = new Set(enabledInstruments);
    if (checked) {
      next.add(inst);
    } else {
      next.delete(inst);
    }
    onEnabledInstrumentsChange(next);
  };

  const toggleAll = () => {
    onEnabledInstrumentsChange(
      allEnabled ? new Set() : new Set(ALL_DRUM_INSTRUMENTS),
    );
  };

  return (
    <>
      <div className="flex items-center space-x-2">
        <Switch
          id="synthetictrack"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
        <label htmlFor="synthetictrack" className="text-sm font-medium">
          Synthetic drums
        </label>
      </div>

      {enabled && (
        <div className="space-y-3 pl-6">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground min-w-[3rem]">
              Vol: {Math.round(volume * 100)}%
            </span>
            <Slider
              value={[volume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => onVolumeChange(v)}
              className="flex-1"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Instruments
              </label>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={toggleAll}>
                {allEnabled ? 'None' : 'All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {ALL_DRUM_INSTRUMENTS.map(inst => (
                <label
                  key={inst}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors',
                    enabledInstruments.has(inst)
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted/50 text-muted-foreground',
                  )}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded"
                    checked={enabledInstruments.has(inst)}
                    onChange={e => toggleInstrument(inst, e.target.checked)}
                  />
                  {DRUM_INSTRUMENT_LABELS[inst]}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
