// src/components/TabSnippet.tsx
//
// Read-only inline AlphaTab renderer constrained to a bar range. Used by RepertoireIQ review
// cards so a tracked tab section / pattern can be previewed without opening the full tab editor.
//
// AlphaTab is heavy — we mount one instance per snippet but turn off playback, cursor,
// metronome, and resize the score down to fit a small card. Loads the composition's binary
// score_data once, then renders settings.display.startBar + barCount.

import {useEffect, useRef, useState} from 'react';
import {AlphaTabApi, importer, LayoutMode, NotationElement, Settings, StaveProfile} from '@coderline/alphatab';
import {Loader2, Play, Pause} from 'lucide-react';
import {loadComposition} from '@/lib/local-db/tab-compositions';
import {applyAlphaTabTheme, useAlphaTabTheme} from '@/lib/alphaTabTheme';

interface Props {
  compositionId: number;
  /** 1-based start bar (matches AlphaTab convention). */
  startBar: number;
  /** Number of bars to render after `startBar`. Capped at 8 by default. */
  barCount?: number;
  /** Track index to render (0 = first track). */
  trackIndex?: number;
}

const MAX_BARS = 8;

export default function TabSnippet({compositionId, startBar, barCount = 4, trackIndex = 0}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Re-apply theme colors when the user toggles dark mode at runtime.
  useAlphaTabTheme(apiRef);

  const togglePlayback = () => {
    if (!playerReady) return;
    apiRef.current?.playPause();
  };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const composition = await loadComposition(compositionId);
        if (cancelled || !composition) {
          setError(composition ? null : 'Composition not found');
          setLoading(false);
          return;
        }

        // Use the plain-object pattern that the alphatab-vite plugin recognizes — passing
        // `new Settings()` skips the plugin's font-asset wiring and the renderer hangs on a
        // missing 'alphaTab' SMuFL font (see AlphaTabWrapper.tsx for the working init).
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
            // Enable MIDI playback so the user can hear the snippet without opening the editor.
            // SoundFont is the same one used elsewhere in the app.
            enablePlayer: true,
            enableCursor: true,
            enableElementHighlighting: false,
            soundFont: '/soundfont/sonivox.sf2',
          },
        };

        const api = new AlphaTabApi(container, settingsObj as unknown as Settings);
        apiRef.current = api;
        // Play the snippet once and stop — looping a 4-bar phrase indefinitely was distracting.
        api.isLooping = false;

        // Mark player as ready once the soundfont is loaded — gates the play button.
        api.soundFontLoaded.on(() => {
          if (!cancelled) setPlayerReady(true);
        });
        // Track play/pause state for the button icon. AlphaTab's PlayerState enum: 0=paused, 1=playing.
        api.playerStateChanged.on((evt: {state: number}) => {
          if (!cancelled) setPlaying(evt.state === 1);
        });

        // Strip title-block elements once the api owns its own Settings instance.
        api.settings.notation.elements.set(NotationElement.ScoreTitle, false);
        api.settings.notation.elements.set(NotationElement.ScoreSubTitle, false);
        api.settings.notation.elements.set(NotationElement.ScoreArtist, false);
        api.settings.notation.elements.set(NotationElement.ScoreAlbum, false);
        api.settings.notation.elements.set(NotationElement.ScoreCopyright, false);
        api.settings.notation.elements.set(NotationElement.ScoreMusic, false);
        api.settings.notation.elements.set(NotationElement.ScoreWords, false);
        // Apply current theme (no re-render — initial render hasn't fired yet).
        applyAlphaTabTheme(api, false);

        const data = new Uint8Array(composition.scoreData);
        const score = importer.ScoreLoader.loadScoreFromBytes(data, api.settings);
        api.renderScore(score, [trackIndex]);

        api.renderFinished.on(() => {
          if (!cancelled) setLoading(false);
        });
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [compositionId, startBar, barCount, trackIndex]);

  return (
    <div className="relative rounded-xl border border-outline-variant/30 bg-surface-container/40 overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container/60 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
        </div>
      )}
      {error && (
        <div className="px-4 py-3 text-xs text-on-surface-variant text-center">
          Couldn't load preview: {error}
        </div>
      )}
      {!loading && !error && (
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
      <div ref={containerRef} className="overflow-x-auto" style={{minHeight: 80, maxHeight: 220}} />
    </div>
  );
}
