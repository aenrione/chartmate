import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useInterval from 'use-interval';
import { parseChartFile } from '@eliwhite/scan-chart';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import AlphaTabSheetMusic from '@/pages/sheet-music/AlphaTabSheetMusic';
import { AudioManager, PracticeModeConfig } from '@/lib/preview/audioManager';
import { generateRudimentClickTrack } from '@/pages/rudiments/generateRudimentClickTrack';
import convertToVexFlow from '@/pages/sheet-music/convertToVexflow';
import type { Measure, DrumNoteInstrument } from '@/pages/sheet-music/drumTypes';
import { generateSyntheticDrumTrack, ALL_DRUM_INSTRUMENTS } from '@/pages/sheet-music/generateSyntheticDrumTrack';
import SyntheticDrumControls from '@/pages/sheet-music/SyntheticDrumControls';
import ZoomControl from '@/components/shared/ZoomControl';
import { type FillEntry } from './fillsData';
import { generateFillChartText } from './generateFillChartText';
import { recordFillSession, getFillStats, type FillStats } from '@/lib/local-db/fill-trainer';

type ParsedChart = ReturnType<typeof parseChartFile>;

const SETTINGS_KEY = 'fills.practice.settings.v1';
const BASE_BPM = 120;

interface PersistedSettings {
  bpm?: number;
  playClickTrack?: boolean;
  masterClickVolume?: number;
  playSyntheticTrack?: boolean;
  syntheticVolume?: number;
  enabledInstruments?: DrumNoteInstrument[];
  enableColors?: boolean;
  loopEnabled?: boolean;
  zoom?: number;
}

/**
 * Scale measure timings to a target BPM.
 * This produces measures with adjusted ms timings so the click track
 * is generated at the correct speed WITHOUT using playbackRate (no pitch change).
 */
function scaleMeasureTimings(measures: Measure[], tempoRatio: number): Measure[] {
  return measures.map(m => ({
    ...m,
    startMs: m.startMs * tempoRatio,
    endMs: m.endMs * tempoRatio,
    beats: m.beats.map(b => ({ ...b })),
    notes: m.notes.map(n => ({
      ...n,
      ms: n.ms * tempoRatio,
    })),
  }));
}

export default function FillPracticeView({
  fill,
}: {
  fill: FillEntry;
}) {
  // Settings state
  const [bpm, setBpm] = useState(120);
  const [playClickTrack, setPlayClickTrack] = useState(true);
  const [masterClickVolume, setMasterClickVolume] = useState(0.7);
  const [playSyntheticTrack, setPlaySyntheticTrack] = useState(true);
  const [syntheticVolume, setSyntheticVolume] = useState(0.7);
  const [enabledInstruments, setEnabledInstruments] = useState<Set<DrumNoteInstrument>>(
    () => new Set(ALL_DRUM_INSTRUMENTS),
  );
  const [enableColors, setEnableColors] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [zoom, setZoom] = useState(1.0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState(0);
  const audioManagerRef = useRef<AudioManager | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Stats state
  const [fillStats, setFillStats] = useState<FillStats | null>(null);

  // Mark as learned state
  const [marking, setMarking] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);

  // Track whether this play session has been recorded
  const hasRecordedRef = useRef(false);

  // Reset hasRecordedRef when fill changes
  useEffect(() => {
    hasRecordedRef.current = false;
  }, [fill.id]);

  // Generate chart data from fill notes
  const chart = useMemo<ParsedChart>(() => {
    const chartText = generateFillChartText(fill.notes, fill.lengthMeasures);
    const data = new TextEncoder().encode(chartText);
    return parseChartFile(data, 'chart', {});
  }, [fill.notes, fill.lengthMeasures]);

  // Get drum track
  const track = useMemo(() => {
    const drumTrack = chart.trackData.find(t => t.instrument === 'drums');
    if (!drumTrack) throw new Error('No drum track found in chart');
    return drumTrack;
  }, [chart]);

  // Base measures at chart's native 120 BPM
  const baseMeasures = useMemo(() => convertToVexFlow(chart, track), [chart, track]);

  // Tempo ratio for scaling ms timings (pitch-independent)
  const tempoRatio = useMemo(() => BASE_BPM / bpm, [bpm]);

  // Scaled measures for click track generation
  const scaledMeasures = useMemo(
    () => scaleMeasureTimings(baseMeasures, tempoRatio),
    [baseMeasures, tempoRatio],
  );

  // Chart duration in seconds
  const chartDuration = useMemo(() => {
    if (scaledMeasures.length === 0) return 0;
    return scaledMeasures[scaledMeasures.length - 1].endMs / 1000;
  }, [scaledMeasures]);

  // Practice mode config for looping
  const practiceModeConfig = useMemo<PracticeModeConfig | null>(() => {
    if (!loopEnabled || chartDuration === 0) return null;
    return {
      startMeasureMs: 0,
      endMeasureMs: chartDuration * 1000,
      startTimeMs: 0,
      endTimeMs: chartDuration * 1000,
    };
  }, [loopEnabled, chartDuration]);

  // Load persisted settings
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed: PersistedSettings = JSON.parse(raw);
        if (parsed.bpm !== undefined) setBpm(parsed.bpm);
        if (parsed.playClickTrack !== undefined) setPlayClickTrack(parsed.playClickTrack);
        if (parsed.masterClickVolume !== undefined) setMasterClickVolume(parsed.masterClickVolume);
        if (parsed.playSyntheticTrack !== undefined) setPlaySyntheticTrack(parsed.playSyntheticTrack);
        if (parsed.syntheticVolume !== undefined) setSyntheticVolume(parsed.syntheticVolume);
        if (parsed.enabledInstruments !== undefined) setEnabledInstruments(new Set(parsed.enabledInstruments));
        if (parsed.enableColors !== undefined) setEnableColors(parsed.enableColors);
        if (parsed.loopEnabled !== undefined) setLoopEnabled(parsed.loopEnabled);
        if (parsed.zoom !== undefined) setZoom(parsed.zoom);
      }
    } catch {}
    setSettingsLoaded(true);
  }, []);

  // Persist settings
  useEffect(() => {
    const settings: PersistedSettings = {
      bpm, playClickTrack, masterClickVolume,
      playSyntheticTrack, syntheticVolume,
      enabledInstruments: [...enabledInstruments] as DrumNoteInstrument[],
      enableColors, loopEnabled, zoom,
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [bpm, playClickTrack, masterClickVolume, playSyntheticTrack, syntheticVolume, enabledInstruments, enableColors, loopEnabled, zoom]);

  // Stable key for enabled instruments — used as effect dep to retrigger generation
  const enabledInstrumentsKey = useMemo(
    () => [...enabledInstruments].sort().join(','),
    [enabledInstruments],
  );

  // Load fill stats on mount and when fill changes
  useEffect(() => {
    getFillStats(fill.id).then(setFillStats).catch(() => {});
  }, [fill.id]);

  // Initialize AudioManager with tempo-scaled click track (no pitch shift)
  const lastAudioState = useRef({ currentTime: 0, wasPlaying: false });

  useEffect(() => {
    if (!settingsLoaded || scaledMeasures.length === 0) return;

    async function init() {
      // Generate click track (per-note ticks) and synthetic drum track in parallel
      const [clickTrack, syntheticTrack] = await Promise.all([
        Promise.resolve(generateRudimentClickTrack(scaledMeasures, masterClickVolume, undefined, false)),
        generateSyntheticDrumTrack(scaledMeasures, enabledInstruments),
      ]);
      const files = [
        { fileName: 'click.mp3', data: clickTrack },
        { fileName: 'synthetic.mp3', data: syntheticTrack },
      ];

      const audioManager = new AudioManager(files, () => {
        setIsPlaying(false);
        setCurrentPlayback(0);
      });

      audioManager.ready.then(() => {
        if (audioManagerRef.current) return;
        audioManager.setVolume('click', playClickTrack ? masterClickVolume : 0);
        audioManager.setVolume('synthetic', playSyntheticTrack ? syntheticVolume : 0);
        // No setTempo — tracks are already generated at target BPM
        if (practiceModeConfig) {
          audioManager.setPracticeMode(practiceModeConfig);
        }
        audioManagerRef.current = audioManager;

        if (lastAudioState.current.wasPlaying) {
          audioManager.play({ time: lastAudioState.current.currentTime });
          setIsPlaying(true);
        }
      });
    }
    init();

    return () => {
      lastAudioState.current = {
        currentTime: audioManagerRef.current?.currentTime ?? 0,
        wasPlaying: audioManagerRef.current?.isPlaying ?? false,
      };
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaledMeasures, masterClickVolume, syntheticVolume, enabledInstrumentsKey, settingsLoaded]);

  // Sync click track volume
  useEffect(() => {
    audioManagerRef.current?.setVolume('click', playClickTrack ? masterClickVolume : 0);
  }, [playClickTrack, masterClickVolume]);

  // Sync synthetic drum volume
  useEffect(() => {
    audioManagerRef.current?.setVolume('synthetic', playSyntheticTrack ? syntheticVolume : 0);
  }, [playSyntheticTrack, syntheticVolume]);

  // Sync practice mode
  useEffect(() => {
    audioManagerRef.current?.setPracticeMode(practiceModeConfig);
  }, [practiceModeConfig]);

  // Playhead polling
  useInterval(
    () => {
      audioManagerRef.current?.checkPracticeModeLoop();
      setCurrentPlayback(audioManagerRef.current?.currentTime ?? 0);
    },
    isPlaying ? 100 : null,
  );

  // Play/pause
  const handlePlay = useCallback(() => {
    if (!audioManagerRef.current) return;
    if (isPlaying) {
      audioManagerRef.current.pause();
      setIsPlaying(false);
    } else if (!audioManagerRef.current.isInitialized) {
      // First play — record the session once
      if (!hasRecordedRef.current) {
        hasRecordedRef.current = true;
        recordFillSession(fill.id, bpm, false).catch(() => {});
      }
      audioManagerRef.current.play({ time: 0 });
      setIsPlaying(true);
    } else {
      audioManagerRef.current.resume();
      setIsPlaying(true);
    }
  }, [isPlaying, fill.id, bpm]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlay();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBpm(prev => Math.min(prev + (e.shiftKey ? 1 : 5), 240));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setBpm(prev => Math.max(prev - (e.shiftKey ? 1 : 5), 40));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlay]);

  // Mark as learned handler
  const handleMarkLearned = async () => {
    setMarking(true);
    await recordFillSession(fill.id, bpm, true);
    setMarkedDone(true);
    setMarking(false);
    // Reload stats
    const newStats = await getFillStats(fill.id);
    setFillStats(newStats);
    // Reset "Marked!" after 2 seconds
    setTimeout(() => setMarkedDone(false), 2000);
  };

  // Difficulty badge color
  const difficultyColor =
    fill.difficulty === 'beginner'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : fill.difficulty === 'intermediate'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex-1 flex flex-col min-h-0 p-4">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <Link to="/fills">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{fill.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {fill.artist} — {fill.song}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
              ~{fill.bpmOriginal} BPM
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${difficultyColor}`}>
              {fill.difficulty}
            </span>
            {fill.tags.map(tag => (
              <span key={tag} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-4 overflow-y-auto">
          {/* BPM */}
          <div className="rounded-xl border p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tempo</div>
            <div className="text-center mb-4">
              <div className="text-5xl font-bold tabular-nums tracking-tighter">{bpm}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">BPM</div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setBpm(prev => Math.max(prev - 5, 40))}>−</Button>
              <Slider
                value={[bpm]}
                min={40}
                max={240}
                step={1}
                onValueChange={([v]) => setBpm(v)}
              />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setBpm(prev => Math.min(prev + 5, 240))}>+</Button>
            </div>
          </div>

          {/* Play */}
          <Button className="w-full" size="lg" onClick={handlePlay}>
            {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>

          {/* Mark as Learned */}
          <Button
            className="w-full"
            variant={markedDone ? 'secondary' : 'outline'}
            onClick={handleMarkLearned}
            disabled={marking}
          >
            {markedDone ? 'Marked!' : marking ? 'Saving…' : 'Mark as Learned'}
          </Button>

          {/* Click Track */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Click Track</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Metronome</span>
              <Switch checked={playClickTrack} onCheckedChange={setPlayClickTrack} />
            </div>
          </div>

          {/* Synthetic Drums */}
          <SyntheticDrumControls
            enabled={playSyntheticTrack}
            onEnabledChange={setPlaySyntheticTrack}
            volume={syntheticVolume}
            onVolumeChange={setSyntheticVolume}
            enabledInstruments={enabledInstruments}
            onEnabledInstrumentsChange={setEnabledInstruments}
          />

          {/* Display */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Colors</span>
              <Switch checked={enableColors} onCheckedChange={setEnableColors} />
            </div>
          </div>

          {/* Loop */}
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Loop</span>
              <Switch checked={loopEnabled} onCheckedChange={setLoopEnabled} />
            </div>
          </div>

          {/* Progress / Stats */}
          <div className="rounded-xl border p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Attempts</span>
              <span className="font-mono font-bold">{fillStats?.attempts ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Best BPM</span>
              <span className="font-mono font-bold">{fillStats?.bestBpm ?? '—'}</span>
            </div>
            {fillStats?.lastPracticed && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Practiced</span>
                <span className="text-xs">{new Date(fillStats.lastPracticed).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Zoom */}
          <ZoomControl zoom={zoom} onZoomChange={setZoom} />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden rounded-xl border p-4">
            <AlphaTabSheetMusic
              chart={chart}
              track={track}
              currentTime={currentPlayback}
              showBarNumbers={false}
              enableColors={enableColors}
              showLyrics={false}
              zoom={zoom}
              onSelectMeasure={time => {
                if (!audioManagerRef.current) return;
                // Scale the measure time by tempo ratio for seek
                audioManagerRef.current.play({ time: time * tempoRatio });
                setIsPlaying(true);
              }}
              triggerRerender={String(zoom)}
              practiceModeConfig={practiceModeConfig}
              onPracticeMeasureSelect={() => {}}
              selectionIndex={null}
              audioManagerRef={audioManagerRef}
              playheadTimeScale={1 / tempoRatio}
              maxStavesPerRow={1}
            />
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
