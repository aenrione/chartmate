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
  onScoreLoaded?: (score: Score) => void;
  onRenderFinished?: () => void;
  onBeatMouseDown?: (beat: Beat) => void;
  onNoteMouseDown?: (note: Note) => void;
  onPlayerStateChanged?: (state: number) => void;
  onPlayerReady?: () => void;
  onPositionChanged?: (currentTime: number, endTime: number, currentTick: number, endTick: number) => void;
  staveMode?: 'tab' | 'notation' | 'both';
}

function staveProfileFromMode(mode: string): StaveProfile {
  if (mode === 'tab') return StaveProfile.Tab;
  if (mode === 'notation') return StaveProfile.Score;
  return StaveProfile.Default;
}

const TabEditorCanvas = forwardRef<TabEditorCanvasHandle, TabEditorCanvasProps>(
  ({cursorBounds, onScoreLoaded, onRenderFinished, onBeatMouseDown, onNoteMouseDown, onPlayerStateChanged, onPlayerReady, onPositionChanged, staveMode = 'tab'}, ref) => {
    const alphaTabRef = useRef<AlphaTabHandle>(null);

    useImperativeHandle(ref, () => ({
      get alphaTab() {
        return alphaTabRef.current;
      },
    }));

    return (
      <div className="relative flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-lg z-0">
        {cursorBounds && (
          <div
            className="absolute pointer-events-none z-10 border-2 border-primary bg-primary/10 rounded-sm transition-all duration-75"
            style={{
              left: cursorBounds.x,
              top: cursorBounds.y,
              width: cursorBounds.width,
              height: cursorBounds.height,
            }}
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
          className="w-full h-full"
        />
      </div>
    );
  },
);

TabEditorCanvas.displayName = 'TabEditorCanvas';
export default TabEditorCanvas;
