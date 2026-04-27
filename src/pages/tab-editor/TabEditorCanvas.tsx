import {useRef, useImperativeHandle, forwardRef} from 'react';
import {LayoutMode, StaveProfile} from '@coderline/alphatab';
import AlphaTabWrapper, {type AlphaTabHandle} from '@/pages/guitar/AlphaTabWrapper';
import type {CursorBounds} from '@/lib/tab-editor/useEditorCursor';
import {AlphaTabApi, model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;
type Beat = InstanceType<typeof model.Beat>;
type Note = InstanceType<typeof model.Note>;

export interface TabEditorCanvasHandle {
  alphaTab: AlphaTabHandle | null;
}

export interface SectionLabel {
  text: string;
  x: number;
  y: number;
}

export interface PatternOverlay {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string;
}

interface TabEditorCanvasProps {
  cursorBounds: CursorBounds | null;
  /** 1-based string number (1 = lowest/bottom string) */
  cursorStringNumber?: number;
  /** Total number of strings on the instrument */
  cursorStringCount?: number;
  /** Section labels rendered as HTML overlays to avoid AlphaTab band-sharing overlap */
  sectionLabels?: SectionLabel[];
  /** Colored bar overlays for detected patterns */
  patternOverlays?: PatternOverlay[];
  onScoreLoaded?: (score: Score) => void;
  onRenderFinished?: () => void;
  onPostRenderFinished?: () => void;
  onApiReady?: (api: AlphaTabApi) => void;
  onBeatMouseDown?: (beat: Beat) => void;
  onNoteMouseDown?: (note: Note) => void;
  onPlayerStateChanged?: (state: number) => void;
  onPlayerReady?: () => void;
  onPlayerFinished?: () => void;
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
    sectionLabels,
    patternOverlays,
    onScoreLoaded,
    onRenderFinished,
    onPostRenderFinished,
    onApiReady,
    onBeatMouseDown,
    onNoteMouseDown,
    onPlayerStateChanged,
    onPlayerReady,
    onPlayerFinished,
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

        {patternOverlays?.map((ov, i) => (
          <div
            key={i}
            className="absolute pointer-events-none z-[5]"
            style={{
              left: ov.x,
              top: ov.y,
              width: ov.w,
              height: ov.h,
              background: `${ov.color}20`,
              borderLeft: `3px solid ${ov.color}`,
            }}
          >
            <span style={{fontSize: 9, color: ov.color, fontWeight: 'bold', paddingLeft: 3, opacity: 0.8}}>
              {ov.label}
            </span>
          </div>
        ))}

        {sectionLabels?.map((label, i) => (
          <div
            key={i}
            className="absolute pointer-events-none z-10 text-[11px] font-bold text-on-surface/70 dark:text-zinc-300/80 tracking-wide uppercase"
            style={{left: label.x, top: label.y}}
          >
            {label.text}
          </div>
        ))}

        <AlphaTabWrapper
          ref={alphaTabRef}
          layoutMode={LayoutMode.Page}
          staveProfile={staveProfileFromMode(staveMode)}
          scale={1.0}
          enablePlayer={true}
          includeNoteBounds={true}
          hideBuiltInSectionLabels={true}
          useScriptProcessorOutput={true}
          onScoreLoaded={onScoreLoaded}
          onRenderFinished={onRenderFinished}
          onPostRenderFinished={onPostRenderFinished}
          onApiReady={onApiReady}
          onBeatMouseDown={onBeatMouseDown}
          onNoteMouseDown={onNoteMouseDown}
          onPlayerStateChanged={onPlayerStateChanged}
          onPlayerReady={onPlayerReady}
          onPlayerFinished={onPlayerFinished}
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
