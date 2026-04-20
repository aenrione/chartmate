import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {invoke, convertFileSrc} from '@tauri-apps/api/core';
import {Button} from '@/components/ui/button';
import {Slider} from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Switch} from '@/components/ui/switch';
import {
  ArrowLeft,
  Play,
  Pause,
  Plus,
  Minus,
  Menu,
  X,
  Volume2,
  Repeat,
  Square,
  Music,
  Youtube,
  Unlink,
  Maximize2,
} from 'lucide-react';
import {LayoutMode, StaveProfile, model} from '@coderline/alphatab';
import AlphaTabWrapper from './AlphaTabWrapper';
import type {AlphaTabHandle} from './AlphaTabWrapper';
import GuitarPracticeControls from './GuitarPracticeControls';
import {parseRocksmithXml} from '@/lib/rocksmith/parseRocksmithXml';
import {convertToAlphaTab} from '@/lib/rocksmith/convertToAlphaTab';
import {cn} from '@/lib/utils';
import {useLocalStorage} from '@/lib/useLocalStorage';
import YouTubePlayer from '@/components/YouTubePlayer';
import {useYoutubeSync} from '@/hooks/useYoutubeSync';
import {snapToYouTubeRate} from '@/lib/youtube-utils';
import type {PlaybackClock} from '@/lib/youtube-sync';
import Tip from '@/components/shared/Tip';
import {TooltipProvider} from '@/components/ui/tooltip';

type Score = InstanceType<typeof model.Score>;
type Track = InstanceType<typeof model.Track>;

import type {RocksmithArrangement} from '@/lib/rocksmith/types';

interface LocationState {
  fileData: number[] | null;
  fileName: string;
  filePath: string;
  fileType: 'guitarpro' | 'rocksmith' | 'psarc';
  psarcArrangement?: RocksmithArrangement;
  psarcArrangements?: RocksmithArrangement[];
}

interface GuitarSettings {
  layoutMode: LayoutMode;
  staveProfile: StaveProfile;
  scale: number;
  playbackSpeed: number;
}

const DEFAULT_SETTINGS: GuitarSettings = {
  layoutMode: LayoutMode.Page,
  staveProfile: StaveProfile.Default,
  scale: 1.0,
  playbackSpeed: 1.0,
};

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function GuitarSongView() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const alphaTabRef = useRef<AlphaTabHandle>(null);

  // Score state
  const [score, setScore] = useState<Score | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [alphaTabApiReady, setAlphaTabApiReady] = useState(false);

  // Position state (batched to avoid render loops from rapid alphaTab events)
  const [position, setPosition] = useState({currentTime: 0, endTime: 0, currentTick: 0, endTick: 0});
  const positionRef = useRef(position);
  positionRef.current = position;

  // Settings
  const [settings, setSettings] = useLocalStorage<GuitarSettings>(
    'guitar.songView.settings.v1',
    DEFAULT_SETTINGS,
  );

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [showPracticeMode, setShowPracticeMode] = useState(false);

  // Original audio state (PSARC only)
  const [useOriginalAudio, setUseOriginalAudio] = useState(state?.fileType === 'psarc');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedSynthVolume = useRef(1.0);
  // Audio offset: Rocksmith beats start at startBeat seconds into the audio
  const audioOffsetRef = useRef(0);

  // PlaybackClock adapter — exposes AlphaTab position as a generic clock
  const clockRef = useRef<PlaybackClock | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  if (!clockRef.current) {
    clockRef.current = {
      get currentTime() {
        return positionRef.current.currentTime / 1000;
      },
      get isPlaying() {
        return isPlayingRef.current;
      },
    };
  }

  // Stable song key for YouTube DB association
  const songKey = useMemo(() => {
    const path = state?.filePath ?? '';
    // Simple stable hash from file path
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
    }
    return `guitar:${Math.abs(hash).toString(36)}`;
  }, [state?.filePath]);

  // YouTube integration
  const {
    youtubeUrl,
    youtubeVideoId,
    youtubeOffsetMs,
    youtubeUrlInput,
    setYoutubeUrlInput,
    playerRef: youtubePlayerRef,
    syncRef: youtubeSyncRef,
    handleUrlSubmit: handleYoutubeUrlSubmit,
    handleRemove: handleYoutubeRemove,
    handleOffsetChange: handleYoutubeOffsetChange,
    handleReady: handleYoutubeReady,
    handleSeek: handleYoutubeSeek,
  } = useYoutubeSync({songKey, clockRef, tempo: settings.playbackSpeed});

  // Dev mode: load from URL query param ?file=/path/to/file.gp5
  const [devFileData, setDevFileData] = useState<Uint8Array | null>(null);
  const devFile = useMemo(() => new URLSearchParams(location.search).get('file'), [location.search]);
  useEffect(() => {
    if (!devFile || state?.fileData) return;
    fetch(devFile)
      .then(r => r.arrayBuffer())
      .then(buf => setDevFileData(new Uint8Array(buf)))
      .catch(err => console.error('Dev file load failed:', err));
  }, [devFile, state?.fileData]);

  // Synthesize state for dev mode
  const effectiveState = useMemo(() => state ?? (devFile ? {
    fileData: [] as number[],
    fileName: devFile.split('/').pop() ?? devFile,
    filePath: devFile,
    fileType: (devFile.endsWith('.xml') ? 'rocksmith' : 'guitarpro') as 'guitarpro' | 'rocksmith',
  } : null), [state, devFile]);

  // Prepare file data
  const fileData = useMemo(() => {
    if (devFileData) return devFileData;
    if (effectiveState?.fileType === 'psarc') return new Uint8Array(0); // PSARC uses pre-built score
    if (!state?.fileData) return null;
    return new Uint8Array(state!.fileData);
  }, [state?.fileData, devFileData, effectiveState?.fileType]);

  // For Rocksmith/PSARC: convert arrangement data to alphaTab Score
  const rocksmithScore = useMemo(() => {
    if (effectiveState?.fileType === 'psarc' && state?.psarcArrangement) {
      try {
        audioOffsetRef.current = state.psarcArrangement.startBeat || 0;
        return convertToAlphaTab(state.psarcArrangement);
      } catch (err) {
        console.error('Failed to convert PSARC arrangement:', err);
        return null;
      }
    }
    if (!fileData?.length || effectiveState?.fileType !== 'rocksmith') return null;
    try {
      const xmlString = new TextDecoder().decode(fileData);
      const arrangement = parseRocksmithXml(xmlString);
      return convertToAlphaTab(arrangement);
    } catch (err) {
      console.error('Failed to parse Rocksmith XML:', err);
      return null;
    }
  }, [fileData, effectiveState?.fileType, state?.psarcArrangement]);

  // Callbacks
  const onScoreLoaded = useCallback((loadedScore: Score) => {
    setScore(loadedScore);
    setSelectedTrackIndex(0);
  }, []);

  const lastSyncRef = useRef(0);
  const onPositionChanged = useCallback(
    (curTime: number, eTime: number, curTick: number, eTick: number) => {
      const prev = positionRef.current;
      if (
        prev.currentTime !== curTime ||
        prev.endTime !== eTime ||
        prev.currentTick !== curTick ||
        prev.endTick !== eTick
      ) {
        setPosition({currentTime: curTime, endTime: eTime, currentTick: curTick, endTick: eTick});
      }

      // Sync audio element position (throttled)
      const audio = audioRef.current;
      if (!audio || !useOriginalAudio || !audio.duration) return;

      // Audio is pre-trimmed to start at beat 0, so no offset needed
      const expectedAudioTime = curTime / 1000;
      const now = Date.now();
      if (now - lastSyncRef.current < 1000) return;
      const drift = Math.abs(audio.currentTime - expectedAudioTime);
      if (drift > 0.15) {
        audio.currentTime = expectedAudioTime;
        lastSyncRef.current = now;
      }
    },
    [useOriginalAudio],
  );

  const onPlayerStateChanged = useCallback((playerState: number) => {
    const playing = playerState === 1;
    setIsPlaying(playing);

    if (playing) {
      youtubeSyncRef.current.onResume();
    } else {
      youtubeSyncRef.current.onPause();
    }

    const audio = audioRef.current;
    if (!audio || !useOriginalAudio) return;

    if (playing) {
      // Sync position before playing (audio is pre-trimmed, no offset needed)
      audio.currentTime = Math.max(0, positionRef.current.currentTime / 1000);
      audio.playbackRate = settings.playbackSpeed;
      audio.play().catch(() => {});
      lastSyncRef.current = Date.now();
    } else {
      audio.pause();
    }
  }, [useOriginalAudio, settings.playbackSpeed]);

  const onPlayerReady = useCallback(() => {
    setIsPlayerReady(true);
  }, []);

  // Load Rocksmith score into alphaTab after API is ready
  useEffect(() => {
    if (rocksmithScore && alphaTabApiReady && alphaTabRef.current) {
      alphaTabRef.current.renderScore(rocksmithScore, [0]);
    }
  }, [rocksmithScore, alphaTabApiReady]);

  // Extract original audio from PSARC (lazy - only when first toggled on)
  useEffect(() => {
    if (!useOriginalAudio || audioUrl || audioLoading) return;
    if (effectiveState?.fileType !== 'psarc' || !effectiveState?.filePath) return;

    setAudioLoading(true);
    invoke<string>('extract_psarc_audio', {path: effectiveState.filePath, trimStart: audioOffsetRef.current})
      .then(wavPath => {
        // Convert local file path to a URL the webview can load
        setAudioUrl(convertFileSrc(wavPath));
      })
      .catch(err => {
        console.error('Failed to extract audio:', err);
        setUseOriginalAudio(false);
      })
      .finally(() => setAudioLoading(false));
  }, [useOriginalAudio, audioUrl, audioLoading, effectiveState?.fileType, effectiveState?.filePath]);

  // Handle toggle: stop playback first to avoid _currentBeat crash, then mute/unmute
  const handleAudioToggle = useCallback((enabled: boolean) => {
    // Stop playback before toggling to avoid alphaTab internal state issues
    const api = alphaTabRef.current?.api;
    const audio = audioRef.current;
    const wasPlaying = isPlaying;

    if (wasPlaying) {
      try { api?.stop(); } catch { /* ignore */ }
      if (audio) { audio.pause(); audio.currentTime = 0; }
    }

    if (enabled) {
      if (api) {
        savedSynthVolume.current = api.masterVolume;
        api.masterVolume = 0;
      }
    } else {
      if (api) api.masterVolume = savedSynthVolume.current;
      if (audio) audio.pause();
    }

    setUseOriginalAudio(enabled);
  }, [isPlaying]);

  // Mute/unmute synth based on audio mode + keep audio element in sync
  useEffect(() => {
    const api = alphaTabRef.current?.api;
    if (useOriginalAudio) {
      // Mute synth whenever original audio is active
      if (api && api.masterVolume > 0) {
        savedSynthVolume.current = api.masterVolume;
        api.masterVolume = 0;
      }
    } else {
      // Restore synth volume
      if (api && savedSynthVolume.current > 0) {
        api.masterVolume = savedSynthVolume.current;
      }
    }

    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = settings.playbackSpeed;
    audio.volume = useOriginalAudio ? masterVolume : 0;
  }, [useOriginalAudio, audioUrl, isPlayerReady, settings.playbackSpeed, masterVolume]);

  // Track selection
  const handleTrackChange = useCallback(
    (value: string) => {
      const idx = Number(value);
      setSelectedTrackIndex(idx);
      if (score && alphaTabRef.current) {
        alphaTabRef.current.renderScore(score, [idx]);
      }
    },
    [score],
  );

  // Playback speed
  const changeSpeed = useCallback(
    (delta: number) => {
      setSettings(prev => {
        const newSpeed = Math.max(0.25, Math.min(2.0, prev.playbackSpeed + delta));
        alphaTabRef.current?.setPlaybackSpeed(newSpeed);
        youtubeSyncRef.current.onTempoChange(newSpeed);
        return {...prev, playbackSpeed: newSpeed};
      });
    },
    [setSettings],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        alphaTabRef.current?.playPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        changeSpeed(0.05);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        changeSpeed(-0.05);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [changeSpeed]);

  // Zoom
  const changeScale = useCallback(
    (delta: number) => {
      setSettings(prev => {
        const newScale = Math.max(0.5, Math.min(2.0, prev.scale + delta));
        alphaTabRef.current?.setScale(newScale);
        return {...prev, scale: newScale};
      });
    },
    [setSettings],
  );

  // Layout mode
  const handleLayoutChange = useCallback(
    (value: string) => {
      const mode = Number(value) as LayoutMode;
      setSettings(prev => ({...prev, layoutMode: mode}));
    },
    [setSettings],
  );

  // Stable array reference for track indexes (avoids re-render loop in AlphaTabWrapper)
  const trackIndexes = useMemo(() => [selectedTrackIndex], [selectedTrackIndex]);

  // Stave profile
  const handleStaveProfileChange = useCallback(
    (value: string) => {
      const profile = Number(value) as StaveProfile;
      setSettings(prev => ({...prev, staveProfile: profile}));
    },
    [setSettings],
  );

  if (!effectiveState) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No file loaded</p>
          <Link to="/guitar" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-surface-container-low text-on-surface hover:bg-surface-container-high h-10 px-4 py-2">
            Open a file
          </Link>
        </div>
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading file...</p>
      </div>
    );
  }

  const tracks: Track[] = score?.tracks ?? [];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex-1 flex min-h-0">
      {/* Sidebar */}
      <div
        className={cn(
          'w-64 border-r flex-shrink-0 overflow-y-auto bg-background',
          'fixed inset-y-0 left-0 z-[1100] transition-transform md:static md:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-4 space-y-5">
          {/* Back + title */}
          <div className="flex items-center gap-2">
            <Link
              to="/guitar"
              className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-surface-container-high"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{effectiveState.fileName}</p>
              {score && (
                <p className="text-xs text-muted-foreground truncate">
                  {score.artist ? `${score.artist} — ` : ''}
                  {score.title || 'Untitled'}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Track selector */}
          {tracks.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Track
              </label>
              <Select
                value={String(selectedTrackIndex)}
                onValueChange={handleTrackChange}
              >
                <SelectTrigger className="h-8 text-xs">
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

          {/* Audio source toggle (PSARC only) */}
          {effectiveState?.fileType === 'psarc' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5" />
                  Original Audio
                </label>
                <Switch
                  checked={useOriginalAudio}
                  disabled={audioLoading}
                  onCheckedChange={handleAudioToggle}
                />
              </div>
              {audioLoading && (
                <p className="text-xs text-muted-foreground">Extracting audio...</p>
              )}
            </div>
          )}

          {/* Volume */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5" />
              Volume
            </label>
            <Slider
              value={[masterVolume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => {
                setMasterVolume(v);
                if (useOriginalAudio && audioRef.current) {
                  audioRef.current.volume = v;
                } else {
                  const api = alphaTabRef.current?.api;
                  if (api) api.masterVolume = v;
                }
              }}
            />
          </div>

          {/* Tempo */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Speed: {Math.round(settings.playbackSpeed * 100)}%
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeSpeed(-0.05)}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Slider
                value={[settings.playbackSpeed]}
                min={0.25}
                max={2.0}
                step={0.05}
                className="flex-1"
                onValueChange={([v]) => {
                  setSettings(prev => ({...prev, playbackSpeed: v}));
                  alphaTabRef.current?.setPlaybackSpeed(v);
                  youtubeSyncRef.current.onTempoChange(v);
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeSpeed(0.05)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Zoom */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Zoom: {Math.round(settings.scale * 100)}%
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeScale(-0.1)}
              >
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
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeScale(0.1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground">
              Display
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs">Layout</span>
                <Select
                  value={String(settings.layoutMode)}
                  onValueChange={handleLayoutChange}
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(LayoutMode.Page)}>
                      Page
                    </SelectItem>
                    <SelectItem value={String(LayoutMode.Horizontal)}>
                      Horizontal
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs">Notation</span>
                <Select
                  value={String(settings.staveProfile)}
                  onValueChange={handleStaveProfileChange}
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(StaveProfile.Default)}>
                      Auto
                    </SelectItem>
                    <SelectItem value={String(StaveProfile.ScoreTab)}>
                      Score + Tab
                    </SelectItem>
                    <SelectItem value={String(StaveProfile.Score)}>
                      Score Only
                    </SelectItem>
                    <SelectItem value={String(StaveProfile.Tab)}>
                      Tab Only
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Practice Mode */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5" />
                Practice Mode
              </label>
              <Switch
                checked={showPracticeMode}
                onCheckedChange={setShowPracticeMode}
              />
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

          {/* YouTube Integration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Youtube className="h-3.5 w-3.5" />
              YouTube
            </label>
            {youtubeVideoId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {youtubeUrl}
                  </span>
                  <Tip label="Remove YouTube video">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={handleYoutubeRemove}>
                      <Unlink className="h-3 w-3" />
                    </Button>
                  </Tip>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Offset</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {youtubeOffsetMs >= 0 ? '+' : ''}{(youtubeOffsetMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleYoutubeOffsetChange(youtubeOffsetMs - 100)}>
                      <span className="text-xs">-</span>
                    </Button>
                    <Slider
                      value={[youtubeOffsetMs]}
                      min={-10000}
                      max={10000}
                      step={100}
                      onValueChange={([v]) => handleYoutubeOffsetChange(v)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleYoutubeOffsetChange(youtubeOffsetMs + 100)}>
                      <span className="text-xs">+</span>
                    </Button>
                  </div>
                </div>
                {settings.playbackSpeed !== 1.0 && snapToYouTubeRate(settings.playbackSpeed) !== settings.playbackSpeed && (
                  <p className="text-xs text-amber-500">
                    YT rate: {snapToYouTubeRate(settings.playbackSpeed)}x (closest to {settings.playbackSpeed.toFixed(2)}x)
                  </p>
                )}
              </div>
            ) : (
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Paste YouTube URL..."
                  value={youtubeUrlInput}
                  onChange={e => setYoutubeUrlInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleYoutubeUrlSubmit();
                  }}
                  className="flex-1 text-xs px-2 py-1 rounded border bg-background min-w-0"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={handleYoutubeUrlSubmit}>
                  Link
                </Button>
              </div>
            )}
          </div>

          {/* Score info */}
          {score && (
            <div className="space-y-1 text-xs text-muted-foreground border-t pt-3">
              {score.title && <p>Title: {score.title}</p>}
              {score.artist && <p>Artist: {score.artist}</p>}
              {score.album && <p>Album: {score.album}</p>}
              <p>Tracks: {score.tracks.length}</p>
              <p>Bars: {score.masterBars.length}</p>
              {score.tempo > 0 && <p>Tempo: {score.tempo} BPM</p>}
            </div>
          )}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Transport bar */}
        <div className="border-b px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => alphaTabRef.current?.playPause()}
            disabled={!isPlayerReady}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              try { alphaTabRef.current?.stop(); } catch { /* ignore */ }
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
            }}
            disabled={!isPlayerReady}
          >
            <Square className="h-4 w-4" />
          </Button>

          <div className="text-xs text-muted-foreground tabular-nums">
            {formatTime(position.currentTime)} / {formatTime(position.endTime)}
          </div>

          {/* Progress bar */}
          <div className="flex-1">
            <Slider
              value={[position.endTick > 0 ? position.currentTick : 0]}
              min={0}
              max={position.endTick || 1}
              step={1}
              onValueChange={([tick]) => {
                const api = alphaTabRef.current?.api;
                if (api) {
                  api.tickPosition = tick;
                  const estimatedTime = position.endTime > 0
                    ? (tick / (position.endTick || 1)) * (position.endTime / 1000)
                    : 0;
                  handleYoutubeSeek(estimatedTime);
                }
              }}
              disabled={!isPlayerReady}
            />
          </div>

          {!isPlayerReady && (
            <span className="text-xs text-muted-foreground">
              Loading player...
            </span>
          )}
        </div>

        {/* YouTube Video Panel */}
        {youtubeVideoId && (
          <div className="mx-4 mt-2 rounded-lg overflow-hidden border bg-black relative group" style={{height: '240px'}}>
            <YouTubePlayer
              ref={youtubePlayerRef}
              videoId={youtubeVideoId}
              onReady={handleYoutubeReady}
              className="w-full h-full"
            />
            <button
              onClick={() => youtubePlayerRef.current?.requestFullscreen()}
              className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* AlphaTab renderer */}
        <AlphaTabWrapper
          ref={alphaTabRef}
          fileData={effectiveState.fileType === 'guitarpro' ? fileData : undefined}
          trackIndexes={trackIndexes}
          layoutMode={settings.layoutMode}
          staveProfile={settings.staveProfile}
          scale={settings.scale}
          enablePlayer={true}
          onScoreLoaded={onScoreLoaded}
          onPositionChanged={onPositionChanged}
          onPlayerStateChanged={onPlayerStateChanged}
          onPlayerReady={onPlayerReady}
          onApiReady={() => setAlphaTabApiReady(true)}
          className="flex-1"
        />
      </div>

      {/* Hidden audio element for original PSARC audio */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
        />
      )}
    </div>
    </TooltipProvider>
  );
}
