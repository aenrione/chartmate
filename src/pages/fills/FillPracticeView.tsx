import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseChartFile } from '@eliwhite/scan-chart';
import { ArrowLeft, Play, Pause, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHideHeaderOnMobile } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import AlphaTabSheetMusic from '@/pages/sheet-music/AlphaTabSheetMusic';
import type { AlphaTabHandle } from '@/pages/guitar/AlphaTabWrapper';
import ZoomControl from '@/components/shared/ZoomControl';
import { type FillEntry, inferFillSticking } from './fillsData';
import { generateFillChartText } from './generateFillChartText';
import { recordFillSession, getFillStats, type FillStats } from '@/lib/local-db/fill-trainer';
import {recordEventSafely} from '@/lib/progression';
import {useActivityContext} from '@/contexts/ActivityTrackerContext';

type ParsedChart = ReturnType<typeof parseChartFile>;

const SETTINGS_KEY = 'fills.practice.settings.v1';
const BASE_BPM = 120;

interface PersistedSettings {
  bpm?: number;
  enableColors?: boolean;
  showSticking?: boolean;
  loopEnabled?: boolean;
  zoom?: number;
}

export default function FillPracticeView({
  fill,
}: {
  fill: FillEntry;
}) {
  useHideHeaderOnMobile();
  useActivityContext('fill');

  // Settings state
  const [bpm, setBpm] = useState(120);
  const [enableColors, setEnableColors] = useState(true);
  const [showSticking, setShowSticking] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [zoom, setZoom] = useState(1.0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const alphaTabHandleRef = useRef<AlphaTabHandle | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Stats state
  const [fillStats, setFillStats] = useState<FillStats | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Mark as learned state
  const [marking, setMarking] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);

  // Track whether this play session has been recorded + when practice started
  const hasRecordedRef = useRef(false);
  const practiceStartedAtRef = useRef<number | null>(null);

  // Reset tracking state when fill changes
  useEffect(() => {
    hasRecordedRef.current = false;
    practiceStartedAtRef.current = null;
    setIsPlaying(false);
    setIsPlayerReady(false);
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

  // Sticking annotations (R/L/K per beat group)
  const stickingAnnotations = useMemo(
    () => showSticking ? inferFillSticking(fill.notes) : undefined,
    [fill.notes, showSticking],
  );

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
        if (parsed.enableColors !== undefined) setEnableColors(parsed.enableColors);
        if (parsed.showSticking !== undefined) setShowSticking(parsed.showSticking);
        if (parsed.loopEnabled !== undefined) setLoopEnabled(parsed.loopEnabled);
        if (parsed.zoom !== undefined) setZoom(parsed.zoom);
      }
    } catch {}
    setSettingsLoaded(true);
  }, []);

  // Persist settings
  useEffect(() => {
    if (!settingsLoaded) return;
    const settings: PersistedSettings = { bpm, enableColors, showSticking, loopEnabled, zoom };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [bpm, enableColors, showSticking, loopEnabled, zoom, settingsLoaded]);

  // Load fill stats on mount and when fill changes
  useEffect(() => {
    getFillStats(fill.id).then(setFillStats).catch(() => {});
  }, [fill.id]);

  // Sync playback speed when bpm changes
  useEffect(() => {
    if (!isPlayerReady) return;
    alphaTabHandleRef.current?.setPlaybackSpeed(bpm / BASE_BPM);
  }, [bpm, isPlayerReady]);

  // Sync loop setting
  useEffect(() => {
    if (!isPlayerReady) return;
    const api = alphaTabHandleRef.current?.getApi();
    if (api) api.isLooping = loopEnabled;
  }, [loopEnabled, isPlayerReady]);

  // Called once when AlphaTab's player finishes loading the soundfont
  const handlePlayerReady = useCallback(() => {
    setIsPlayerReady(true);
    alphaTabHandleRef.current?.setPlaybackSpeed(bpm / BASE_BPM);
    const api = alphaTabHandleRef.current?.getApi();
    if (api) api.isLooping = loopEnabled;
  // bpm and loopEnabled intentionally captured at ready time; effects above sync subsequent changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track play/pause state from AlphaTab
  const handlePlayerStateChanged = useCallback((state: number) => {
    setIsPlaying(state === 1);
  }, []);

  // Play/pause
  const handlePlay = useCallback(() => {
    if (!isPlayerReady) return;
    if (!hasRecordedRef.current) {
      hasRecordedRef.current = true;
      practiceStartedAtRef.current = Date.now();
      recordFillSession(fill.id, bpm, false, 0).catch(() => {});
    }
    alphaTabHandleRef.current?.playPause();
  }, [isPlayerReady, fill.id, bpm]);

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
    const elapsedMs = practiceStartedAtRef.current
      ? Math.max(0, Date.now() - practiceStartedAtRef.current)
      : 0;
    await recordFillSession(fill.id, bpm, true, elapsedMs);
    await recordEventSafely({kind: 'fill_practiced', fillId: fill.id, bpm, clean: true});
    setMarkedDone(true);
    setMarking(false);
    const newStats = await getFillStats(fill.id);
    setFillStats(newStats);
    setTimeout(() => setMarkedDone(false), 2000);
  };

  const difficultyColor =
    fill.difficulty === 'beginner'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : fill.difficulty === 'intermediate'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex-1 flex flex-col min-h-0 p-2 lg:p-4">
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

          {/* Play */}
          <Button
            className="w-full"
            size="lg"
            onClick={handlePlay}
            disabled={!isPlayerReady}
          >
            {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {!isPlayerReady ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
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

          {/* Display */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Colors</span>
              <Switch checked={enableColors} onCheckedChange={setEnableColors} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Sticking (R/L/K)</span>
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
          {/* Mobile transport bar */}
          <div className="lg:hidden flex items-center gap-2 pb-2 mb-2 border-b shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handlePlay} disabled={!isPlayerReady}>
              {isPlaying ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
              {!isPlayerReady ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
            </Button>
            <span className="text-sm font-mono font-bold ml-auto">{bpm} BPM</span>
          </div>

          <div className="flex-1 overflow-hidden lg:rounded-xl lg:border lg:p-4">
            <AlphaTabSheetMusic
              chart={chart}
              track={track}
              currentTime={0}
              showBarNumbers={false}
              enableColors={enableColors}
              showLyrics={false}
              zoom={zoom}
              onSelectMeasure={() => {}}
              triggerRerender={String(zoom)}
              selectionIndex={null}
              maxStavesPerRow={1}
              noteAnnotations={stickingAnnotations}
              enablePlayer
              alphaTabHandleRef={alphaTabHandleRef}
              onPlayerStateChanged={handlePlayerStateChanged}
              onPlayerReady={handlePlayerReady}
            />
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
