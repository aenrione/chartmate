import {model} from '@coderline/alphatab';
import {cn} from '@/lib/utils';
import type {NoteEffect} from '@/lib/tab-editor/scoreOperations';

const {Duration} = model;

interface NoteInputPanelProps {
  currentDuration: number;
  onDurationChange: (duration: number) => void;
  onEffectToggle: (effect: NoteEffect | 'slide' | 'bend') => void;
  onDotToggle: () => void;
  onRestInsert: () => void;
  onAddMeasure: () => void;
  onDeleteMeasure: () => void;
}

const DURATIONS = [
  {value: Duration.Whole, label: 'W', subtitle: '1', title: 'Whole note (Ctrl+1)'},
  {value: Duration.Half, label: 'H', subtitle: '2', title: 'Half note (Ctrl+2)'},
  {value: Duration.Quarter, label: 'Q', subtitle: '4', title: 'Quarter note (Ctrl+3)'},
  {value: Duration.Eighth, label: '8th', subtitle: '8', title: 'Eighth note (Ctrl+4)'},
  {value: Duration.Sixteenth, label: '16th', subtitle: '16', title: 'Sixteenth note (Ctrl+5)'},
  {value: Duration.ThirtySecond, label: '32nd', subtitle: '32', title: '32nd note (Ctrl+6)'},
  {value: Duration.SixtyFourth, label: '64th', subtitle: '64', title: '64th note (Ctrl+7)'},
];

const EFFECTS: {key: NoteEffect | 'slide' | 'bend'; label: string; title: string}[] = [
  {key: 'hammerOn', label: 'H/P', title: 'Hammer-on / Pull-off (H)'},
  {key: 'slide', label: 'Slide', title: 'Slide (S)'},
  {key: 'bend', label: 'Bend', title: 'Bend (B)'},
  {key: 'palmMute', label: 'PM', title: 'Palm Mute (M)'},
  {key: 'vibrato', label: 'Vib', title: 'Vibrato (V)'},
  {key: 'tap', label: 'Tap', title: 'Tap (T)'},
  {key: 'harmonic', label: 'Harm', title: 'Natural Harmonic'},
  {key: 'ghostNote', label: 'Ghost', title: 'Ghost Note (G)'},
];

export default function NoteInputPanel({
  currentDuration,
  onDurationChange,
  onEffectToggle,
  onDotToggle,
  onRestInsert,
  onAddMeasure,
  onDeleteMeasure,
}: NoteInputPanelProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-container border-t border-outline-variant/20 overflow-x-auto">
      {/* Duration buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-on-surface-variant/60 font-medium mr-1.5 uppercase tracking-wider">Dur</span>
        {DURATIONS.map(d => (
          <button
            key={d.value}
            onClick={() => onDurationChange(d.value)}
            title={d.title}
            className={cn(
              'min-w-[32px] h-7 px-1.5 flex items-center justify-center rounded text-[11px] font-semibold transition-colors',
              currentDuration === d.value
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {d.label}
          </button>
        ))}
        <button
          onClick={onDotToggle}
          title="Dotted note (.)"
          className="min-w-[28px] h-7 px-1 flex items-center justify-center rounded text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          .
        </button>
        <button
          onClick={onRestInsert}
          title="Insert rest (R)"
          className="min-w-[32px] h-7 px-1.5 flex items-center justify-center rounded text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          Rest
        </button>
      </div>

      <div className="w-px h-5 bg-outline-variant/20 shrink-0" />

      {/* Effect buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-on-surface-variant/60 font-medium mr-1.5 uppercase tracking-wider">FX</span>
        {EFFECTS.map(eff => (
          <button
            key={eff.key}
            onClick={() => onEffectToggle(eff.key)}
            title={eff.title}
            className="px-1.5 h-7 flex items-center justify-center rounded text-[11px] font-medium text-on-surface-variant hover:bg-surface-container-high active:bg-primary/10 transition-colors"
          >
            {eff.label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-outline-variant/20 shrink-0" />

      {/* Measure operations */}
      <div className="flex items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-on-surface-variant/60 font-medium mr-1.5 uppercase tracking-wider">Bar</span>
        <button
          onClick={onAddMeasure}
          title="Add measure after current (+)"
          className="px-2 h-7 flex items-center justify-center rounded text-[11px] font-medium text-on-surface-variant hover:bg-surface-container-high active:bg-primary/10 transition-colors"
        >
          + Add
        </button>
        <button
          onClick={onDeleteMeasure}
          title="Delete current measure (-)"
          className="px-2 h-7 flex items-center justify-center rounded text-[11px] font-medium text-on-surface-variant hover:bg-surface-container-high active:bg-error/10 transition-colors"
        >
          - Del
        </button>
      </div>
    </div>
  );
}
