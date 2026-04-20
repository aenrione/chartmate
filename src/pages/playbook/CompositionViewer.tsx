import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Play, Pause, Square, Minus, Plus, Repeat, Printer} from 'lucide-react';
import {useAlphaTabPrint} from '@/hooks/usePrint';
import {LayoutMode, StaveProfile, model} from '@coderline/alphatab';
import {Button} from '@/components/ui/button';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AlphaTabWrapper from '@/pages/guitar/AlphaTabWrapper';
import type {AlphaTabHandle} from '@/pages/guitar/AlphaTabWrapper';
import GuitarPracticeControls from '@/pages/guitar/GuitarPracticeControls';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {usePlaybook} from './PlaybookProvider';

type Score = InstanceType<typeof model.Score>;

interface Settings {
  layoutMode: LayoutMode;
  staveProfile: StaveProfile;
  scale: number;
}

const DEFAULT_SETTINGS: Settings = {
  layoutMode: LayoutMode.Page,
  staveProfile: StaveProfile.Default,
  scale: 1.0,
};

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function CompositionViewer({scoreData}: {scoreData: ArrayBuffer}) {
  const {isPlaying, speed, setIsPlaying, setSpeed} = usePlaybook();

  const alphaTabRef = useRef<AlphaTabHandle>(null);
  const playerReadyRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [score, setScore] = useState<Score | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [showPracticeMode, setShowPracticeMode] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [position, setPosition] = useState({currentTime: 0, endTime: 0, currentTick: 0, endTick: 0});
  const positionRef = useRef(position);
  positionRef.current = position;

  const [settings, setSettings] = useLocalStorage<Settings>(
    'guitar.songView.settings.v1',
    DEFAULT_SETTINGS,
  );

  // Sync playbook speed → AlphaTab (speed is 25–200, AlphaTab wants 0.25–2.0)
  useEffect(() => {
    if (!playerReadyRef.current) return;
    alphaTabRef.current?.setPlaybackSpeed(speed / 100);
  }, [speed]);

  // Sync playbook isPlaying → AlphaTab
  useEffect(() => {
    const api = alphaTabRef.current?.getApi();
    if (!api || !playerReadyRef.current) return;
    const atPlaying = (api.playerState as number) === 1;
    if (isPlaying !== atPlaying) api.playPause();
  }, [isPlaying]);

  const trackIndexes = useMemo(() => [selectedTrackIndex], [selectedTrackIndex]);

  const handleTrackChange = useCallback((value: string) => {
    const idx = Number(value);
    setSelectedTrackIndex(idx);
    if (score && alphaTabRef.current) {
      alphaTabRef.current.renderScore(score, [idx]);
    }
  }, [score]);

  const changeSpeed = useCallback((delta: number) => {
    const next = Math.max(25, Math.min(200, Math.round((speed + delta * 100) / 5) * 5));
    setSpeed(next);
    alphaTabRef.current?.setPlaybackSpeed(next / 100);
  }, [speed, setSpeed]);

  const changeScale = useCallback((delta: number) => {
    setSettings(prev => {
      const next = Math.max(0.5, Math.min(2.0, Math.round((prev.scale + delta) * 10) / 10));
      alphaTabRef.current?.setScale(next);
      return {...prev, scale: next};
    });
  }, [setSettings]);

  const getApiForPrint = useCallback(() => alphaTabRef.current?.getApi() ?? null, []);
  const handlePrint = useAlphaTabPrint(getApiForPrint);

  const tracks: InstanceType<typeof model.Track>[] = score?.tracks ?? [];

  return (
    <div className="flex-1 flex min-h-0">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 border-r border-white/5 overflow-y-auto bg-surface-container-low" data-print-hide>
        <div className="p-3 space-y-4">

          {/* Track selector */}
          {tracks.length > 1 && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
                Track
              </label>
              <Select value={String(selectedTrackIndex)} onValueChange={handleTrackChange}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tracks.map((t, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {t.name || `Track ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Volume */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
              Volume
            </label>
            <Slider
              value={[masterVolume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => {
                setMasterVolume(v);
                const api = alphaTabRef.current?.getApi();
                if (api) api.masterVolume = v;
              }}
            />
          </div>

          {/* Speed */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
              Speed: {speed}%
            </label>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" onClick={() => changeSpeed(-0.05)}>
                <Minus className="h-3 w-3" />
              </Button>
              <Slider
                value={[speed]}
                min={25}
                max={200}
                step={5}
                className="flex-1"
                onValueChange={([v]) => {
                  setSpeed(v);
                  alphaTabRef.current?.setPlaybackSpeed(v / 100);
                }}
              />
              <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" onClick={() => changeSpeed(0.05)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Zoom */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
              Zoom: {Math.round(settings.scale * 100)}%
            </label>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" onClick={() => changeScale(-0.1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <Slider
                value={[settings.scale]}
                min={0.5}
                max={2.0}
                step={0.1}
                className="flex-1"
                onValueChange={([v]) => {
                  setSettings(prev => ({...prev, scale: v}));
                  alphaTabRef.current?.setScale(v);
                }}
              />
              <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" onClick={() => changeScale(0.1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Display */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
              Display
            </label>

            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Layout</span>
              <Select
                value={String(settings.layoutMode)}
                onValueChange={v => setSettings(prev => ({...prev, layoutMode: Number(v) as LayoutMode}))}
              >
                <SelectTrigger className="h-6 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(LayoutMode.Page)}>Page</SelectItem>
                  <SelectItem value={String(LayoutMode.Horizontal)}>Horizontal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Notation</span>
              <Select
                value={String(settings.staveProfile)}
                onValueChange={v => setSettings(prev => ({...prev, staveProfile: Number(v) as StaveProfile}))}
              >
                <SelectTrigger className="h-6 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(StaveProfile.Default)}>Auto</SelectItem>
                  <SelectItem value={String(StaveProfile.ScoreTab)}>Score + Tab</SelectItem>
                  <SelectItem value={String(StaveProfile.Score)}>Score Only</SelectItem>
                  <SelectItem value={String(StaveProfile.Tab)}>Tab Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Practice mode */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant flex items-center gap-1.5">
                <Repeat className="h-3 w-3" />
                Practice
              </label>
              <Switch checked={showPracticeMode} onCheckedChange={setShowPracticeMode} />
            </div>
            {showPracticeMode && (
              <GuitarPracticeControls
                alphaTabRef={alphaTabRef}
                score={score}
                currentTick={position.currentTick}
                endTick={position.endTick}
              />
            )}
          </div>

          {/* Score info */}
          {score && (
            <div className="space-y-0.5 text-xs text-on-surface-variant border-t border-white/5 pt-3">
              {score.title && <p className="truncate">Title: {score.title}</p>}
              {score.artist && <p className="truncate">Artist: {score.artist}</p>}
              <p>Bars: {score.masterBars.length}</p>
              {score.tempo > 0 && <p>Tempo: {score.tempo} BPM</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Transport bar */}
        <div className="border-b border-white/5 px-3 py-1.5 flex items-center gap-2 shrink-0 bg-surface-container-low" data-print-hide>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={!isPlayerReady}
            onClick={() => alphaTabRef.current?.playPause()}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!isPlayerReady}
            onClick={() => { try { alphaTabRef.current?.stop(); } catch { /* ignore */ } }}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>

          <span className="text-xs font-mono text-on-surface-variant tabular-nums">
            {formatTime(position.currentTime)} / {formatTime(position.endTime)}
          </span>

          <div className="flex-1">
            <Slider
              value={[position.endTick > 0 ? position.currentTick : 0]}
              min={0}
              max={position.endTick || 1}
              step={1}
              disabled={!isPlayerReady}
              onValueChange={([tick]) => {
                const api = alphaTabRef.current?.getApi();
                if (api) api.tickPosition = tick;
              }}
            />
          </div>

          {!isPlayerReady && (
            <span className="text-xs text-on-surface-variant">Loading…</span>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-auto"
            onClick={handlePrint}
            title="Print / Save as PDF"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Tab renderer */}
        <AlphaTabWrapper
          ref={alphaTabRef}
          fileData={scoreData}
          trackIndexes={trackIndexes}
          layoutMode={settings.layoutMode}
          staveProfile={settings.staveProfile}
          scale={settings.scale}
          enablePlayer
          onScoreLoaded={s => { setScore(s); setSelectedTrackIndex(0); }}
          onPositionChanged={(ct, et, ctk, etk) => {
            const prev = positionRef.current;
            if (prev.currentTime !== ct || prev.endTime !== et || prev.currentTick !== ctk || prev.endTick !== etk) {
              setPosition({currentTime: ct, endTime: et, currentTick: ctk, endTick: etk});
            }
          }}
          onPlayerStateChanged={state => {
            const playing = state === 1;
            if (playing !== isPlayingRef.current) setIsPlaying(playing);
          }}
          onPlayerReady={() => {
            playerReadyRef.current = true;
            setIsPlayerReady(true);
            alphaTabRef.current?.setPlaybackSpeed(speed / 100);
          }}
          className="flex-1"
        />
      </div>
    </div>
  );
}
