import {useRef, useImperativeHandle, forwardRef} from 'react';
import {LayoutMode, StaveProfile} from '@coderline/alphatab';
import AlphaTabWrapper, {type AlphaTabHandle} from '@/pages/guitar/AlphaTabWrapper';
import type {CursorBounds} from '@/lib/tab-editor/useEditorCursor';
import {model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;
type Beat = InstanceType<typeof model.Beat>;
type Note = InstanceType<typeof model.Note>;

export interface TabEditorCanvasHandle {
  alphaTab: AlphaTabHandle | null;
}

interface TabEditorCanvasProps {
  cursorBounds: CursorBounds | null;
  /** 1-based string number (1 = lowest/bottom string) */
  cursorStringNumber?: number;
  /** Total number of strings on the instrument */
  cursorStringCount?: number;
  onScoreLoaded?: (score: Score) => void;
  onRenderFinished?: () => void;
  onBeatMouseDown?: (beat: Beat) => void;
  onNoteMouseDown?: (note: Note) => void;
  onPlayerStateChanged?: (state: number) => void;
  onPlayerReady?: () => void;
  onPositionChanged?: (currentTime: number, endTime: number, currentTick: number, endTick: number) => void;
  onActiveBeatsChanged?: (beats: Beat[]) => void;
  staveMode?: 'tab' | 'notation' | 'both';
}

function staveProfileFromMode(mode: string): StaveProfile {
  if (mode === 'tab') return StaveProfile.Tab;
  if (mode === 'notation') return StaveProfile.Score;
  return StaveProfile.Default;
}

const TabEditorCanvas = forwardRef<TabEditorCanvasHandle, TabEditorCanvasProps>(
  ({
    cursorBounds,
    cursorStringNumber = 1,
    cursorStringCount = 6,
    onScoreLoaded,
    onRenderFinished,
    onBeatMouseDown,
    onNoteMouseDown,
    onPlayerStateChanged,
    onPlayerReady,
    onPositionChanged,
    onActiveBeatsChanged,
    staveMode = 'tab',
  }, ref) => {
    const alphaTabRef = useRef<AlphaTabHandle>(null);

    useImperativeHandle(ref, () => ({
      get alphaTab() {
        return alphaTabRef.current;
      },
    }));

    // Compute string-row cursor: highlight only the row for the active string.
    // AlphaTab's stringNumber: 1 = bottom (lowest pitch), N = top (highest pitch).
    // Visual row order in tab: top row = highest string = stringNumber N.
    //
    // Height formula: the staff spans from the first string line (y = cursorBounds.y)
    // to just below the last string line. The N-1 inter-string spaces fill nearly all
    // of cursorBounds.height, with roughly 1px left for the last line's stroke.
    // So: spacing ≈ (cursorBounds.height - 1) / (stringCount - 1).
    // We center each zone on its string line; the outermost zones are clamped to
    // stay within [cursorBounds.y, cursorBounds.y + cursorBounds.height].
    let stringCursorStyle: React.CSSProperties | null = null;
    if (cursorBounds && cursorStringCount > 1) {
      const spacing = (cursorBounds.height - 1) / (cursorStringCount - 1);
      const rowIndex = cursorStringCount - cursorStringNumber; // 0 = top row
      const lineY = cursorBounds.y + rowIndex * spacing;
      // No clamping: let zones extend ±spacing/2 around each string line.
      // For the top/bottom strings this reaches ~6px beyond the staff bounds —
      // that whitespace exists anyway and clamping was shifting those zones off-center.
      stringCursorStyle = {
        left: cursorBounds.x,
        top: lineY - spacing / 2,
        width: cursorBounds.width,
        height: spacing,
        transition: 'left 75ms, width 75ms',
      };
    }

    return (
      <div className="relative flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-lg z-0">
        {stringCursorStyle && (
          <div
            className="absolute pointer-events-none z-10 border-2 border-primary bg-primary/20 rounded-none"
            style={stringCursorStyle}
          />
        )}

        <AlphaTabWrapper
          ref={alphaTabRef}
          layoutMode={LayoutMode.Page}
          staveProfile={staveProfileFromMode(staveMode)}
          scale={1.0}
          enablePlayer={true}
          includeNoteBounds={true}
          onScoreLoaded={onScoreLoaded}
          onRenderFinished={onRenderFinished}
          onBeatMouseDown={onBeatMouseDown}
          onNoteMouseDown={onNoteMouseDown}
          onPlayerStateChanged={onPlayerStateChanged}
          onPlayerReady={onPlayerReady}
          onPositionChanged={onPositionChanged}
          onActiveBeatsChanged={onActiveBeatsChanged}
          className="w-full h-full"
        />
      </div>
    );
  },
);

TabEditorCanvas.displayName = 'TabEditorCanvas';
export default TabEditorCanvas;
