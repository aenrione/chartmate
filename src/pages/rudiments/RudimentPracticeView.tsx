import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useInterval from 'use-interval';
import { parseChartFile } from '@eliwhite/scan-chart';
import { ArrowLeft, Play, Pause, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHideHeaderOnMobile } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AlphaTabSheetMusic from '@/pages/sheet-music/AlphaTabSheetMusic';
import { AudioManager, PracticeModeConfig } from '@/lib/preview/audioManager';
import { generateRudimentClickTrack } from './generateRudimentClickTrack';
import convertToVexFlow from '@/pages/sheet-music/convertToVexflow';
import type { Measure } from '@/pages/sheet-music/drumTypes';
import ZoomControl from '@/components/shared/ZoomControl';
import { getRudimentById, type Rudiment } from './rudimentData';
import {
  generateRudimentChartText,
  getPatternNoteCount,
  type Subdivision,
} from './generateRudimentChart';

type ParsedChart = ReturnType<typeof parseChartFile>;

const SETTINGS_KEY = 'rudiments.practice.settings.v1';
const BASE_BPM = 120;

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  '32nd': '32nd Notes',
  '16th': '16th Notes',
  'triplet': 'Triplets',
  '8th': '8th Notes',
  'quarter': 'Quarter Notes',
};


interface PersistedSettings {
  bpm?: number;
  playClickTrack?: boolean;
  masterClickVolume?: number;
  enableColors?: boolean;
  loopEnabled?: boolean;
  zoom?: number;
  subdivision?: Subdivision;
  showSticking?: boolean;
  distinctLR?: boolean;
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

/**
 * Parse sticking pattern string into per-note R/L annotations.
 */
function parseSticking(sticking: string): string[] {
  return sticking.replace(/·/g, '').trim().split(/\s+/);
}

export default function RudimentPracticeView({
  rudiment,
}: {
  rudiment: Rudiment;
}) {
  useHideHeaderOnMobile();

  // Settings state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [playClickTrack, setPlayClickTrack] = useState(true);
  const [masterClickVolume, setMasterClickVolume] = useState(0.7);
  const [enableColors, setEnableColors] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [subdivision, setSubdivision] = useState<Subdivision>('16th');
  const [showSticking, setShowSticking] = useState(true);
  const [distinctLR, setDistinctLR] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState(0);
  const audioManagerRef = useRef<AudioManager | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Generate chart data dynamically based on rudiment + subdivision
  const noteCount = useMemo(() => getPatternNoteCount(rudiment.sticking), [rudiment.sticking]);

  const chart = useMemo<ParsedChart>(() => {
    const chartText = generateRudimentChartText(noteCount, subdivision);
    const data = new TextEncoder().encode(chartText);
    return parseChartFile(data, 'chart', {});
  }, [noteCount, subdivision]);

  // Get drum track
  const track = useMemo(() => {
    const drumTrack = chart.trackData.find(t => t.instrument === 'drums');
    if (!drumTrack) throw new Error('No drum track found in chart');
    return drumTrack;
  }, [chart]);

  // Base measures at chart's native 120 BPM
  const baseMeasures = useMemo(() => convertToVexFlow(chart, track), [chart, track]);

  // Tempo ratio for scaling ms timings (pitch-independent)
  // The chart already has notes at the right subdivision spacing,
  // so BPM just controls the beat rate. More notes per beat = faster sound.
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

  // Parse sticking annotations (always parsed — used for both display and L/R sounds)
  const stickingTokens = useMemo(
    () => parseSticking(rudiment.sticking),
    [rudiment.sticking],
  );
  const stickingAnnotations = showSticking ? stickingTokens : undefined;

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
        if (parsed.enableColors !== undefined) setEnableColors(parsed.enableColors);
        if (parsed.loopEnabled !== undefined) setLoopEnabled(parsed.loopEnabled);
        if (parsed.zoom !== undefined) setZoom(parsed.zoom);
        if (parsed.subdivision) setSubdivision(parsed.subdivision);
        if (parsed.showSticking !== undefined) setShowSticking(parsed.showSticking);
        if (parsed.distinctLR !== undefined) setDistinctLR(parsed.distinctLR);
      }
    } catch {}
    setSettingsLoaded(true);
  }, []);

  // Persist settings
  useEffect(() => {
    const settings: PersistedSettings = {
      bpm, playClickTrack, masterClickVolume,
      enableColors, loopEnabled, zoom, subdivision, showSticking, distinctLR,
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [bpm, playClickTrack, masterClickVolume, enableColors, loopEnabled, zoom, subdivision, showSticking, distinctLR]);

  // Initialize AudioManager with tempo-scaled click track (no pitch shift)
  const lastAudioState = useRef({ currentTime: 0, wasPlaying: false });

  useEffect(() => {
    if (!settingsLoaded || scaledMeasures.length === 0) return;

    async function init() {
      // Generate click track that clicks on every note (not just beats)
      const clickTrack = generateRudimentClickTrack(
        scaledMeasures, masterClickVolume, stickingTokens, distinctLR,
      );
      const files = [{ fileName: 'click.mp3', data: clickTrack }];

      const audioManager = new AudioManager(files, () => {
        setIsPlaying(false);
        setCurrentPlayback(0);
      });

      audioManager.ready.then(() => {
        if (audioManagerRef.current) return;
        audioManager.setVolume('click', playClickTrack ? masterClickVolume : 0);
        // No setTempo — click track is already generated at target BPM
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
  }, [scaledMeasures, masterClickVolume, settingsLoaded, distinctLR]);

  // Sync click track volume
  useEffect(() => {
    audioManagerRef.current?.setVolume('click', playClickTrack ? masterClickVolume : 0);
  }, [playClickTrack, masterClickVolume]);

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
      audioManagerRef.current.play({ time: 0 });
      setIsPlaying(true);
    } else {
      audioManagerRef.current.resume();
      setIsPlaying(true);
    }
  }, [isPlaying]);

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

  // Prev/Next rudiments
  const prevRudiment = getRudimentById(rudiment.id - 1);
  const nextRudiment = getRudimentById(rudiment.id + 1);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex-1 flex flex-col min-h-0 p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <Link to="/rudiments">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{rudiment.name}</h1>
          <p className="text-xs text-muted-foreground">
            {rudiment.category.charAt(0).toUpperCase() + rudiment.category.slice(1)} · #{rudiment.id} of 40
          </p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            'w-64 shrink-0 space-y-4 overflow-y-auto bg-background',
            'fixed inset-y-0 left-0 z-[1100] transition-transform px-4 lg:static lg:translate-x-0 lg:px-0',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
          }}
        >
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

          {/* Subdivision */}
          <div className="rounded-xl border p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Note Value</div>
            <Select value={subdivision} onValueChange={(v) => setSubdivision(v as Subdivision)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SUBDIVISION_LABELS) as Subdivision[]).map(sub => (
                  <SelectItem key={sub} value={sub}>
                    {SUBDIVISION_LABELS[sub]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Play */}
          <Button className="w-full" size="lg" onClick={handlePlay}>
            {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>

          {/* Click Track */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Click Track</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Metronome</span>
              <Switch checked={playClickTrack} onCheckedChange={setPlayClickTrack} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">L/R Sounds</span>
              <Switch checked={distinctLR} onCheckedChange={setDistinctLR} />
            </div>
          </div>

          {/* Display */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Colors</span>
              <Switch checked={enableColors} onCheckedChange={setEnableColors} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Sticking (R/L)</span>
              <Switch checked={showSticking} onCheckedChange={setShowSticking} />
            </div>
          </div>

          {/* Loop */}
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Loop</span>
              <Switch checked={loopEnabled} onCheckedChange={setLoopEnabled} />
            </div>
          </div>

          {/* Zoom */}
          <ZoomControl zoom={zoom} onZoomChange={setZoom} />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mobile transport bar */}
          <div className="lg:hidden flex items-center gap-2 pb-2 mb-2 border-b shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handlePlay}>
              {isPlaying ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <span className="text-sm font-mono font-bold ml-auto">{bpm} BPM</span>
          </div>

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
              triggerRerender={String(zoom) + subdivision}
              practiceModeConfig={practiceModeConfig}
              onPracticeMeasureSelect={() => {}}
              selectionIndex={null}
              audioManagerRef={audioManagerRef}
              noteAnnotations={stickingAnnotations}
              playheadTimeScale={1 / tempoRatio}
              maxStavesPerRow={1}
            />
          </div>

          {/* Prev/Next navigation */}
          <div className="flex justify-between mt-4 pt-4 border-t">
            {prevRudiment ? (
              <Link
                to={`/rudiments/${prevRudiment.id}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← <span className="font-medium">#{prevRudiment.id} {prevRudiment.name}</span>
              </Link>
            ) : <div />}
            {nextRudiment ? (
              <Link
                to={`/rudiments/${nextRudiment.id}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <span className="font-medium">#{nextRudiment.id} {nextRudiment.name}</span> →
              </Link>
            ) : <div />}
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
