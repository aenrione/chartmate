import {RefObject, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {parseChartFile} from '@eliwhite/scan-chart';
import {LayoutMode, StaveProfile, model} from '@coderline/alphatab';
import AlphaTabWrapper, {type AlphaTabHandle} from '@/pages/guitar/AlphaTabWrapper';
import convertToAlphaTabDrums, {buildMeasureBoundaries, type DrumMeasureInfo} from './convertToAlphaTabDrums';
import {AlphaTabPlayhead, buildTimePositionMap, type TimePositionPoint} from '@/components/AlphaTabPlayhead';
import {PracticeModeConfig} from '@/lib/preview/audioManager';
import {cn} from '@/lib/utils';
import cleanLyrics from './cleanLyrics';

type ParsedChart = ReturnType<typeof parseChartFile>;
type Beat = InstanceType<typeof model.Beat>;

// --- Color strategies for note overlays ---

// Colors by drum instrument (MIDI note → color) — used for song charts
const INSTRUMENT_COLORS: Record<number, string> = {
  36: '#ff793f', // kick — orange
  38: '#e74c3c', // snare — red
  42: '#ffb142', // hihat — yellow
  51: '#2980b9', // ride — blue
  49: '#27ae60', // crash — green
  48: '#ffb142', // high-tom — yellow
  45: '#2980b9', // mid-tom — blue
  41: '#27ae60', // floor-tom — green
};

// Colors by sticking hand — used for rudiments/fills when noteAnnotations are present
const STICKING_COLORS: Record<string, string> = {
  R: '#6c9eef', // right hand — blue
  L: '#ef6c6c', // left hand — red
  K: '#888888', // kick foot — grey
};

interface AlphaTabSheetMusicProps {
  chart: ParsedChart;
  track: ParsedChart['trackData'][0];
  currentTime: number;
  showBarNumbers: boolean;
  enableColors: boolean;
  showLyrics: boolean;
  zoom: number;
  onSelectMeasure: (time: number) => void;
  triggerRerender: string;
  practiceModeConfig?: PracticeModeConfig | null;
  onPracticeMeasureSelect?: (measureIndex: number) => void;
  selectionIndex?: number | null;
  audioManagerRef?: RefObject<any>;
  patternMap?: Map<number, {color: string; label: string}>;
  noteAnnotations?: string[];
  playheadTimeScale?: number;
  maxStavesPerRow?: number;
  /** Use AlphaTab's built-in player instead of external AudioManager */
  enablePlayer?: boolean;
  /** When enablePlayer=true, exposes the internal AlphaTabHandle for playback control */
  alphaTabHandleRef?: {current: AlphaTabHandle | null};
  /** When enablePlayer=true, called when player state changes (1=playing, 0=stopped) */
  onPlayerStateChanged?: (state: number) => void;
  /** When enablePlayer=true, called when player is ready */
  onPlayerReady?: () => void;
}

export default function AlphaTabSheetMusic({
  chart,
  track,
  currentTime,
  showBarNumbers: _showBarNumbers,
  enableColors,
  showLyrics,
  zoom,
  onSelectMeasure,
  triggerRerender,
  practiceModeConfig = null,
  onPracticeMeasureSelect = () => {},
  selectionIndex = null,
  audioManagerRef,
  patternMap,
  noteAnnotations,
  playheadTimeScale = 1,
  maxStavesPerRow: _maxStavesPerRow,
  enablePlayer = false,
  alphaTabHandleRef,
  onPlayerStateChanged,
  onPlayerReady,
}: AlphaTabSheetMusicProps) {
  const alphaTabRef = useRef<AlphaTabHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measureInfosRef = useRef<DrumMeasureInfo[]>([]);
  const scoreRenderedRef = useRef(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timePositionMap, setTimePositionMap] = useState<TimePositionPoint[]>([]);

  // Expose inner handle to parent when enablePlayer=true
  useEffect(() => {
    if (alphaTabHandleRef) {
      alphaTabHandleRef.current = alphaTabRef.current;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute measure timing info (for click handling and practice mode)
  const measureInfos = useMemo(() => buildMeasureBoundaries(chart, track), [chart, track]);
  measureInfosRef.current = measureInfos;

  // Build the AlphaTab Score from ParsedChart
  const score = useMemo(() => {
    const lyrics = showLyrics
      ? (chart as any).lyrics
          ?.filter((lyric: any) => !lyric.text.includes('['))
          .map((lyric: any) => ({...lyric, text: cleanLyrics(lyric.text)})) || []
      : [];

    return convertToAlphaTabDrums(chart, track, {
      noteAnnotations,
      lyrics,
      sections: chart.sections,
    });
  }, [chart, track, noteAnnotations, showLyrics]);

  // Render score into AlphaTab when it changes
  useEffect(() => {
    const handle = alphaTabRef.current;
    if (!handle || !score) return;

    // Small delay to ensure AlphaTab API is fully initialized
    const timer = setTimeout(() => {
      const api = handle.getApi();
      if (api) {
        api.settings.display.justifyLastSystem = true;
        api.settings.fillFromJson({
          display: {
            notationStaffPaddingBottom: 10,
          },
        });
        api.updateSettings();
      }
      handle.renderScore(score, [0]);
    }, 100);

    return () => clearTimeout(timer);
  }, [score]);

  // Update zoom
  useEffect(() => {
    alphaTabRef.current?.setScale(zoom);
  }, [zoom]);

  // Re-render when container width changes (e.g., Clone Hero toggle)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let lastWidth = wrapper.offsetWidth;
    const observer = new ResizeObserver(() => {
      const newWidth = wrapper.offsetWidth;
      if (newWidth !== lastWidth && newWidth > 0) {
        lastWidth = newWidth;
        // Debounce the re-render
        setTimeout(() => {
          const api = alphaTabRef.current?.getApi();
          if (api) api.render();
        }, 150);
      }
    });

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // Handle beat click → compute measure time → call onSelectMeasure
  const handleBeatMouseDown = useCallback((beat: Beat) => {
    const infos = measureInfosRef.current;
    if (!infos.length) return;

    // Find which bar this beat belongs to
    const barIndex = beat.voice?.bar?.index ?? -1;
    if (barIndex >= 0 && barIndex < infos.length) {
      if (selectionIndex !== null) {
        onPracticeMeasureSelect(barIndex);
        return;
      }
      onSelectMeasure(infos[barIndex].startMs / 1000);
    }
  }, [onSelectMeasure, onPracticeMeasureSelect, selectionIndex]);

  const applyOverlays = useCallback(() => {
    const api = alphaTabRef.current?.getApi();
    if (!api) return;

    const boundsLookup = api.renderer.boundsLookup;
    if (!boundsLookup || boundsLookup.staffSystems.length === 0) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const atSurface = wrapper.querySelector<HTMLElement>('.at-surface');
    if (!atSurface) return;

    // Compute at-surface's position relative to wrapper
    const wrapperRect = wrapper.getBoundingClientRect();
    const surfaceRect = atSurface.getBoundingClientRect();
    const offsetX = surfaceRect.left - wrapperRect.left;
    const offsetY = surfaceRect.top - wrapperRect.top;

    // Get or create our overlay div as a direct child of wrapper (outside AlphaTab's DOM)
    let overlayDiv = wrapper.querySelector<HTMLElement>('.cm-overlays');
    if (!overlayDiv) {
      overlayDiv = document.createElement('div');
      overlayDiv.className = 'cm-overlays';
      overlayDiv.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; z-index: 10;';
      wrapper.appendChild(overlayDiv);
    }

    // Clear previous overlays
    overlayDiv.innerHTML = '';

    // Color overlays: small colored circles at each note head position.
    // When noteAnnotations are present (rudiments), color by sticking hand (R/L).
    // Otherwise (song charts), color by drum instrument.
    if (enableColors) {
      const useStickingColors = !!(noteAnnotations && noteAnnotations.length > 0);
      let annotationIdx = 0;

      for (const sg of boundsLookup.staffSystems) {
        for (const masterBarBounds of sg.bars) {
          for (const barBounds of masterBarBounds.bars) {
            for (const beatBounds of barBounds.beats) {
              if (beatBounds.beat.isEmpty || !beatBounds.notes) continue;

              // Determine color for this beat
              let color: string | undefined;
              if (useStickingColors) {
                const ann = noteAnnotations![annotationIdx % noteAnnotations!.length];
                color = STICKING_COLORS[ann] ?? STICKING_COLORS['R'];
                annotationIdx++;
              }

              for (const nb of beatBounds.notes) {
                if (!nb.noteHeadBounds) continue;

                // For instrument coloring, each note in a chord can have a different color
                const noteColor = useStickingColors
                  ? color!
                  : INSTRUMENT_COLORS[nb.note.percussionArticulation];
                if (!noteColor) continue;

                const nhb = nb.noteHeadBounds;
                const dot = document.createElement('div');
                dot.className = 'cm-color-overlay';
                dot.style.cssText = `
                  position: absolute;
                  left: ${offsetX + nhb.x}px;
                  top: ${offsetY + nhb.y}px;
                  width: ${nhb.w}px;
                  height: ${nhb.h}px;
                  background: ${noteColor};
                  border-radius: 50%;
                  opacity: 0.55;
                  pointer-events: none;
                `;
                overlayDiv.appendChild(dot);
              }
            }
          }
        }
      }
    }

    // Practice mode dimming
    const infos = measureInfosRef.current;
    if (practiceModeConfig && practiceModeConfig.endTimeMs > 0) {
      for (const sg of boundsLookup.staffSystems) {
        for (const masterBarBounds of sg.bars) {
          const barIdx = masterBarBounds.index;
          if (barIdx < 0 || barIdx >= infos.length) continue;

          const mi = infos[barIdx];
          const inRange =
            mi.startMs >= practiceModeConfig.startMeasureMs - 1 &&
            mi.endMs <= practiceModeConfig.endMeasureMs + 1;

          if (!inRange) {
            const bounds = masterBarBounds.visualBounds;
            const overlay = document.createElement('div');
            overlay.className = 'cm-color-overlay';
            overlay.style.cssText = `
              position: absolute;
              left: ${offsetX + bounds.x}px;
              top: ${offsetY + bounds.y}px;
              width: ${bounds.w}px;
              height: ${bounds.h}px;
              background: rgba(128, 128, 128, 0.5);
              pointer-events: none;
            `;
            overlayDiv.appendChild(overlay);
          }
        }
      }
    }

    // Pattern map overlays
    if (patternMap && patternMap.size > 0) {
      for (const sg of boundsLookup.staffSystems) {
        for (const masterBarBounds of sg.bars) {
          const barIdx = masterBarBounds.index;
          const patternInfo = patternMap.get(barIdx);
          if (!patternInfo) continue;

          const bounds = masterBarBounds.visualBounds;
          const overlay = document.createElement('div');
          overlay.className = 'cm-color-overlay';
          overlay.style.cssText = `
            position: absolute;
            left: ${offsetX + bounds.x}px;
            top: ${offsetY + bounds.y}px;
            width: ${bounds.w}px;
            height: ${bounds.h}px;
            background: ${patternInfo.color}20;
            border-left: 3px solid ${patternInfo.color};
            pointer-events: none;
          `;

          if (patternInfo.label && patternInfo.label !== '-') {
            const label = document.createElement('span');
            label.textContent = patternInfo.label;
            label.style.cssText = `
              position: absolute; top: 2px; left: 4px;
              font-size: 10px; font-weight: bold;
              color: ${patternInfo.color};
            `;
            overlay.appendChild(label);
          }

          overlayDiv.appendChild(overlay);
        }
      }
    }

    // Build time→position map for playhead
    const newMap = buildTimePositionMap(boundsLookup, infos, offsetX, offsetY);
    setTimePositionMap(newMap);
  }, [enableColors, practiceModeConfig, patternMap, noteAnnotations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced callback for AlphaTab's renderFinished event
  const handleRenderFinished = useCallback(() => {
    scoreRenderedRef.current = true;
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(applyOverlays, 200);
  }, [applyOverlays]);

  // Re-apply overlays when color/practice settings change (without re-render)
  useEffect(() => {
    if (scoreRenderedRef.current) {
      applyOverlays();
    }
  }, [enableColors, noteAnnotations, practiceModeConfig, patternMap, applyOverlays]);

  return (
    <div className={cn(
      'flex-1 flex justify-center bg-white dark:bg-zinc-900 rounded-lg border overflow-y-auto overflow-x-hidden min-h-0',
    )}>
      <div ref={wrapperRef} className="relative w-full">
        <AlphaTabWrapper
          ref={alphaTabRef}
          layoutMode={LayoutMode.Page}
          staveProfile={StaveProfile.Score}
          scale={zoom}
          enablePlayer={enablePlayer}
          includeNoteBounds={enableColors}
          onBeatMouseDown={handleBeatMouseDown}
          onRenderFinished={handleRenderFinished}
          onPlayerStateChanged={onPlayerStateChanged}
          onPlayerReady={onPlayerReady}
          disableAutoResize
          className="w-full"
        />
        {!enablePlayer && audioManagerRef && (
          <AlphaTabPlayhead
            timePositionMap={timePositionMap}
            audioManagerRef={audioManagerRef}
            zoom={zoom}
            playheadTimeScale={playheadTimeScale}
          />
        )}
      </div>
    </div>
  );
}
