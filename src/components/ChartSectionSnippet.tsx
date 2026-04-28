// src/components/ChartSectionSnippet.tsx
//
// Read-only AlphaTab snippet for drum saved charts. Mirrors TabSnippet in spirit, but the
// data path is different: instead of loading binary AlphaTab from `tab_compositions.score_data`,
// we go through the existing chart loader pipeline (download/cache → parse via scan-chart →
// convertToAlphaTabDrums to build a Score) before rendering with display.startBar/barCount.
//
// Drum-only by design — no other Clone Hero instruments have a chart→AlphaTab converter today.

import {useEffect, useRef, useState} from 'react';
import {AlphaTabApi, LayoutMode, NotationElement, type Settings, StaveProfile} from '@coderline/alphatab';
import {Loader2, Play, Pause} from 'lucide-react';
import {applyAlphaTabTheme, useAlphaTabTheme} from '@/lib/alphaTabTheme';
import {useChartLoader} from '@/lib/useChartLoader';
import convertToAlphaTabDrums from '@/pages/sheet-music/convertToAlphaTabDrums';

interface Props {
  md5: string;
  /** 1-based start bar (matches AlphaTab convention). */
  startBar: number;
  /** Number of bars to render. Capped at 8. */
  barCount?: number;
}

const MAX_BARS = 8;

function findDrumTrack(chart: any) {
  // Match SongView.tsx — drum tracks have instrument === 'drums'. Prefer expert difficulty
  // when present; fall back to any drum part if not.
  const drums = chart.trackData?.filter((t: any) => t.instrument === 'drums') ?? [];
  if (drums.length === 0) return null;
  return drums.find((t: any) => t.difficulty === 'expert') ?? drums[0];
}

export default function ChartSectionSnippet({md5, startBar, barCount = 4}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  const {data, loading: chartLoading, error: chartError} = useChartLoader(md5);

  useAlphaTabTheme(apiRef);

  const togglePlayback = () => {
    if (!playerReady) return;
    apiRef.current?.playPause();
  };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !data) return;

    setRendering(true);
    setError(null);

    try {
      const drumTrack = findDrumTrack(data.chart);
      if (!drumTrack) {
        setError('No drum track in this chart');
        setRendering(false);
        return;
      }

      const score = convertToAlphaTabDrums(data.chart, drumTrack, {
        sections: (data.chart as any).sections,
      });

      const settingsObj = {
        core: {
          fontDirectory: '/font/',
          engine: 'svg',
          logLevel: 3,
        },
        display: {
          startBar: Math.max(1, startBar),
          barCount: Math.min(MAX_BARS, Math.max(1, barCount)),
          scale: 0.85,
          layoutMode: LayoutMode.Horizontal,
          staveProfile: StaveProfile.Default,
        },
        player: {
          // MIDI playback so users can hear the section/pattern. Drums use the standard
          // GM percussion channel which sonivox supports out of the box.
          enablePlayer: true,
          enableCursor: true,
          enableElementHighlighting: false,
          soundFont: '/soundfont/sonivox.sf2',
        },
      };

      const api = new AlphaTabApi(container, settingsObj as unknown as Settings);
      apiRef.current = api;
      // Play once and stop — looping a single bar indefinitely was distracting.
      api.isLooping = false;

      // Player wiring: wait for soundfont, track play/pause for the button icon.
      api.soundFontLoaded.on(() => {
        if (!cancelled) setPlayerReady(true);
      });
      api.playerStateChanged.on((evt: {state: number}) => {
        if (!cancelled) setPlaying(evt.state === 1);
      });

      // Strip the title block so the snippet shows only the bars.
      api.settings.notation.elements.set(NotationElement.ScoreTitle, false);
      api.settings.notation.elements.set(NotationElement.ScoreSubTitle, false);
      api.settings.notation.elements.set(NotationElement.ScoreArtist, false);
      api.settings.notation.elements.set(NotationElement.ScoreAlbum, false);
      api.settings.notation.elements.set(NotationElement.ScoreCopyright, false);
      api.settings.notation.elements.set(NotationElement.ScoreMusic, false);
      api.settings.notation.elements.set(NotationElement.ScoreWords, false);
      applyAlphaTabTheme(api, false);

      api.renderScore(score, [0]);

      api.renderFinished.on(() => {
        if (!cancelled) setRendering(false);
      });
    } catch (e) {
      if (!cancelled) {
        setError(String(e));
        setRendering(false);
      }
    }

    return () => {
      cancelled = true;
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [data, startBar, barCount]);

  const showLoader = chartLoading || rendering;
  const errMsg = chartError ?? error;

  return (
    <div className="relative rounded-xl border border-outline-variant/30 bg-surface-container/40 overflow-hidden">
      {showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container/60 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
        </div>
      )}
      {errMsg && (
        <div className="px-4 py-3 text-xs text-on-surface-variant text-center">
          Couldn't load preview: {errMsg}
        </div>
      )}
      {!showLoader && !errMsg && (
        <button
          onClick={togglePlayback}
          disabled={!playerReady}
          className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full bg-primary text-on-primary shadow-md flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title={playerReady ? (playing ? 'Pause' : 'Play preview') : 'Loading audio…'}
          aria-label={playing ? 'Pause snippet' : 'Play snippet'}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
        </button>
      )}
      <div ref={containerRef} className="overflow-x-auto" style={{minHeight: 100, maxHeight: 240}} />
    </div>
  );
}
