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
    let stringCursorStyle: React.CSSProperties | null = null;
    if (cursorBounds) {
      const rowHeight = cursorBounds.height / cursorStringCount;
      const rowIndex = cursorStringCount - cursorStringNumber; // 0 = top row
      stringCursorStyle = {
        left: cursorBounds.x,
        top: cursorBounds.y + rowIndex * rowHeight,
        width: cursorBounds.width,
        height: rowHeight,
        // Only transition horizontal movement — vertical jumps between lines are instant
        transition: 'left 75ms, width 75ms',
      };
    }

    return (
      <div className="relative flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-lg z-0">
        {stringCursorStyle && (
          <div
            className="absolute pointer-events-none z-10 border-2 border-primary bg-primary/20 rounded-sm"
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
