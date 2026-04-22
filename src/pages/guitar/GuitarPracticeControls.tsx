import {useCallback, useState} from 'react';
import {Button} from '@/components/ui/button';
import {model} from '@coderline/alphatab';
import type {AlphaTabHandle} from './AlphaTabWrapper';

type Score = InstanceType<typeof model.Score>;
type MasterBar = InstanceType<typeof model.MasterBar>;

interface Props {
  alphaTabRef: React.RefObject<AlphaTabHandle | null>;
  score: Score | null;
  currentTick: number;
  endTick: number;
}

export default function GuitarPracticeControls({
  alphaTabRef,
  score,
  currentTick,
  endTick,
}: Props) {
  const [startBar, setStartBar] = useState(1);
  const [endBar, setEndBar] = useState(1);
  const [startBarInput, setStartBarInput] = useState('1');
  const [endBarInput, setEndBarInput] = useState('1');
  const [isLooping, setIsLooping] = useState(false);

  const totalBars = score?.masterBars?.length ?? 1;

  const setLoopRange = useCallback(
    (start: number, end: number) => {
      if (!score || !alphaTabRef.current) return;
      const masterBars = score.masterBars as (MasterBar & {start?: number})[];
      if (start < 1 || end > masterBars.length || start > end) return;

      const startMb = masterBars[start - 1];
      const startTickVal = startMb.start ?? 0;
      let endTickVal: number;
      if (end < masterBars.length) {
        endTickVal = masterBars[end].start ?? endTick;
      } else {
        endTickVal = endTick;
      }

      alphaTabRef.current.setPlaybackRange(startTickVal, endTickVal);
      setIsLooping(true);
    },
    [score, alphaTabRef, endTick],
  );

  const clearLoop = useCallback(() => {
    alphaTabRef.current?.clearPlaybackRange();
    setIsLooping(false);
  }, [alphaTabRef]);

  // Quick section select from score sections (if available)
  const sections: {bar: number; text: string}[] = [];
  if (score?.masterBars) {
    for (let i = 0; i < score.masterBars.length; i++) {
      const mb = score.masterBars[i];
      if (mb.section) {
        sections.push({bar: i + 1, text: mb.section.text});
      }
    }
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Bar range selector */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span>Bars:</span>
          <input
            type="text"
            inputMode="numeric"
            className="w-14 h-6 text-xs text-center border rounded bg-background"
            value={startBarInput}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setStartBarInput(raw);
              const n = parseInt(raw, 10);
              if (!isNaN(n)) setStartBar(Math.max(1, Math.min(totalBars, n)));
            }}
            onBlur={() => {
              const clamped = Math.max(1, Math.min(totalBars, startBar));
              setStartBar(clamped);
              setStartBarInput(String(clamped));
            }}
          />
          <span>to</span>
          <input
            type="text"
            inputMode="numeric"
            className="w-14 h-6 text-xs text-center border rounded bg-background"
            value={endBarInput}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setEndBarInput(raw);
              const n = parseInt(raw, 10);
              if (!isNaN(n)) setEndBar(Math.max(1, Math.min(totalBars, n)));
            }}
            onBlur={() => {
              const clamped = Math.max(1, Math.min(totalBars, endBar));
              setEndBar(clamped);
              setEndBarInput(String(clamped));
            }}
          />
          <span className="text-muted-foreground">/ {totalBars}</span>
        </div>

        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => setLoopRange(startBar, endBar)}
            disabled={startBar > endBar}
          >
            Loop
          </Button>
          {isLooping && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={clearLoop}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Section quick select */}
      {sections.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Sections</span>
          <div className="flex flex-wrap gap-1">
            {sections.map((s, i) => {
              const nextSection = sections[i + 1];
              const sectionEndBar = nextSection
                ? nextSection.bar - 1
                : totalBars;
              return (
                <Button
                  key={`${s.bar}-${i}`}
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setStartBar(s.bar);
                    setEndBar(sectionEndBar);
                    setStartBarInput(String(s.bar));
                    setEndBarInput(String(sectionEndBar));
                    setLoopRange(s.bar, sectionEndBar);
                  }}
                >
                  {s.text ?? `Bar ${s.bar}`}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Speed trainer */}
      <div className="text-xs text-muted-foreground">
        Tip: Use the Speed slider above to slow down difficult passages.
      </div>
    </div>
  );
}
