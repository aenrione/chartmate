import {RefObject, useEffect, useRef, memo} from 'react';

/** Minimum vertical distance (px) to detect the playhead has moved to a new staff line. */
const NEW_LINE_THRESHOLD = 5;

export interface TimePositionPoint {
  ms: number;
  x: number;
  y: number;
}

interface AlphaTabPlayheadProps {
  /** Sorted array of time→position points built from boundsLookup */
  timePositionMap: TimePositionPoint[];
  /** Ref to the AudioManager (or any object with a `currentTime` property in seconds) */
  audioManagerRef: RefObject<{currentTime: number} | null>;
  /** Zoom/scale factor for staff height */
  zoom: number;
  /** Multiplier applied to audio time before lookup (e.g., for tempo scaling) */
  playheadTimeScale?: number;
}

/**
 * Reusable playhead cursor bar that follows audio playback.
 * Place inside a `position: relative` container alongside AlphaTab's rendered content.
 *
 * Requires a `timePositionMap` built from AlphaTab's boundsLookup (use `buildTimePositionMap`).
 */
export const AlphaTabPlayhead = memo(function AlphaTabPlayhead({
  timePositionMap,
  audioManagerRef,
  zoom,
  playheadTimeScale = 1,
}: AlphaTabPlayheadProps) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const am = audioManagerRef?.current;
      const ph = playheadRef.current;
      const map = timePositionMap;

      if (!am || !ph || map.length === 0) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const currentMs = am.currentTime * 1000 * playheadTimeScale;
      if (currentMs <= 0) {
        ph.style.display = 'none';
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      let left = 0;
      let right = map.length - 1;

      if (currentMs <= map[0].ms) {
        ph.style.display = 'block';
        ph.style.left = `${map[0].x}px`;
        ph.style.top = `${map[0].y}px`;
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      if (currentMs >= map[right].ms) {
        ph.style.display = 'none';
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (map[mid].ms <= currentMs) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      const before = map[right];
      const after = map[left];

      if (before && after) {
        const ratio = (currentMs - before.ms) / (after.ms - before.ms);
        const x = before.x + ratio * (after.x - before.x);
        const y = before.y + ratio * (after.y - before.y);

        ph.style.display = 'block';
        ph.style.left = `${x}px`;
        ph.style.top = `${y}px`;

        // Auto-scroll when the playhead moves to a new line
        if (Math.abs(y - lastYRef.current) > NEW_LINE_THRESHOLD) {
          lastYRef.current = y;
          ph.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [timePositionMap, audioManagerRef, playheadTimeScale]);

  return (
    <div
      ref={playheadRef}
      className="absolute pointer-events-none bg-primary z-20"
      style={{
        left: 0,
        top: 0,
        width: '2px',
        height: `${120 * zoom}px`,
        transform: 'translateX(-50%)',
        display: 'none',
      }}>
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full"
        style={{marginTop: '-6px'}}
      />
    </div>
  );
});

/**
 * Build a time→position map from AlphaTab's boundsLookup + measure timing info.
 * Returns a sorted array of {ms, x, y} points suitable for the AlphaTabPlayhead component.
 *
 * @param boundsLookup - AlphaTab's renderer.boundsLookup
 * @param measureInfos - Array of {startMs, endMs, startTick, endTick, barIndex}
 * @param offsetX - Horizontal offset of the .at-surface within the container
 * @param offsetY - Vertical offset of the .at-surface within the container
 */
export function buildTimePositionMap(
  boundsLookup: {staffSystems: Array<{bars: Array<any>}>},
  measureInfos: Array<{startMs: number; endMs: number; barIndex: number}>,
  offsetX: number,
  offsetY: number,
): TimePositionPoint[] {
  const timeMap: TimePositionPoint[] = [];
  const measureMap = new Map(measureInfos.map(m => [m.barIndex, m]));

  for (const sg of boundsLookup.staffSystems) {
    for (const masterBarBounds of sg.bars) {
      const barIdx = masterBarBounds.index;
      const mi = measureMap.get(barIdx);
      if (!mi) continue;

      // Measure start
      timeMap.push({
        ms: mi.startMs,
        x: offsetX + masterBarBounds.visualBounds.x,
        y: offsetY + masterBarBounds.visualBounds.y,
      });

      // Beat positions within the measure
      for (const barBounds of masterBarBounds.bars) {
        for (const beatBounds of barBounds.beats) {
          if (beatBounds.beat.isEmpty) continue;
          const beatX = beatBounds.onNotesX;
          const barStartX = masterBarBounds.visualBounds.x;
          const barWidth = masterBarBounds.visualBounds.w;
          const ratio = barWidth > 0 ? (beatX - barStartX) / barWidth : 0;
          const beatMs = mi.startMs + ratio * (mi.endMs - mi.startMs);
          timeMap.push({
            ms: beatMs,
            x: offsetX + beatX,
            y: offsetY + masterBarBounds.visualBounds.y,
          });
        }
      }

      // Measure end
      timeMap.push({
        ms: mi.endMs,
        x: offsetX + masterBarBounds.visualBounds.x + masterBarBounds.visualBounds.w,
        y: offsetY + masterBarBounds.visualBounds.y,
      });
    }
  }

  timeMap.sort((a, b) => a.ms - b.ms);
  return timeMap;
}
