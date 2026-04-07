import {Difficulty} from '@eliwhite/scan-chart';

import {Button} from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Menu,
  X,
  Settings2,
  Maximize2,
  Minimize2,
  Repeat,
  List,
  ChevronRight,
  Timer,
  Grid3X3,
  Bookmark,
  Loader2,
  Youtube,
  Unlink,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Link} from 'react-router-dom';
import useInterval from 'use-interval';
import {ChartResponseEncore} from '@/lib/chartSelection';
import YouTubePlayer from '@/components/YouTubePlayer';
import {snapToYouTubeRate} from '@/lib/youtube-utils';
import {useYoutubeSync} from '@/hooks/useYoutubeSync';

import {getBasename} from '@/lib/src-shared/utils';
import {cn} from '@/lib/utils';
import SheetMusic from './SheetMusic';
import {Files, ParsedChart} from '@/lib/preview/chorus-chart-processing';
import {AudioManager, PracticeModeConfig} from '@/lib/preview/audioManager';
import CloneHeroRenderer from './CloneHeroRenderer';
import {generateClickTrackFromMeasures} from './generateClickTrack';
import type {ClickVolumes} from './generateClickTrack';
import convertToVexFlow from './convertToVexflow';
import type {DrumNoteInstrument} from './convertToVexflow';
import {generateSyntheticDrumTrack, ALL_DRUM_INSTRUMENTS} from './generateSyntheticDrumTrack';
import SyntheticDrumControls from './SyntheticDrumControls';
import {buildPatternVocabulary} from '@/lib/patternVocabulary';
import PatternVocabularyPanel from '@/components/PatternVocabularyPanel';
import debounce from 'debounce';
import {saveChart, unsaveChart, isChartSaved} from '@/lib/local-db/saved-charts';
import {isChartCached, fetchAndCacheChart, deleteCachedChart} from '@/lib/sheet-music-cache';
import {toast} from 'sonner';
import Tip from '@/components/shared/Tip';
import TempoControl from '@/components/shared/TempoControl';
import ZoomControl from '@/components/shared/ZoomControl';

function getDrumDifficulties(chart: ParsedChart): Difficulty[] {
  return chart.trackData
    .filter(part => part.instrument === 'drums')
    .map(part => part.difficulty);
}

function capitalize(fileName: string): string {
  return fileName[0].toUpperCase() + getBasename(fileName).slice(1);
}

interface VolumeControl {
  trackName: string;
  volume: number;
  previousVolume?: number;
  isMuted: boolean;
  isSoloed: boolean;
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins)}:${String(secs).padStart(2, '0')}`;
}

function parseTimeInput(value: string): number | null {
  // Accept "M:SS" or just seconds
  const parts = value.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

export default function Renderer({
  metadata,
  chart,
  audioFiles,
}: {
  metadata: ChartResponseEncore;
  chart: ParsedChart;
  audioFiles: Files;
}) {
  const SETTINGS_KEY = 'sheetMusic.songView.settings.v1';
  const TRACK_SETTINGS_KEY = 'sheetMusic.songView.trackVolumes.v1';

  type PersistedSettings = {
    selectedDifficulty?: Difficulty;
    playClickTrack?: boolean;
    masterClickVolume?: number;
    clickVolumes?: ClickVolumes;
    showBarNumbers?: boolean;
    enableColors?: boolean;
    showLyrics?: boolean;
    viewCloneHero?: boolean;
    tempo?: number;
    zoom?: number;
    masterVolume?: number;
    playSyntheticTrack?: boolean;
    syntheticVolume?: number;
    enabledDrumInstruments?: DrumNoteInstrument[];
    showPatterns?: boolean;
  };
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [playSyntheticTrack, setPlaySyntheticTrack] = useState(false);
  const [syntheticVolume, setSyntheticVolume] = useState(0.7);
  const [enabledDrumInstruments, setEnabledDrumInstruments] = useState<
    Set<DrumNoteInstrument>
  >(new Set(ALL_DRUM_INSTRUMENTS));
  const [playClickTrack, setPlayClickTrack] = useState(true);
  const [clickTrackConfigurationOpen, setClickTrackConfigurationOpen] =
    useState(false);
  const [masterClickVolume, setMasterClickVolume] = useState(0.7);
  const [clickVolumes, setClickVolumes] = useState<ClickVolumes>({
    wholeNote: 1,
    quarterNote: 0.75,
    eighthNote: 0.1,
    tripletNote: 0,
  });

  const [showBarNumbers, setShowBarNumbers] = useState(false);
  const [enableColors, setEnableColors] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true);
  const [viewCloneHero, setViewCloneHero] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumeControls, setVolumeControls] = useState<VolumeControl[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(false);

  // Saved chart state
  const [isSaved, setIsSaved] = useState(false);
  const [savingInProgress, setSavingInProgress] = useState(false);

  useEffect(() => {
    isChartSaved(metadata.md5).then(setIsSaved);
  }, [metadata.md5]);

  const handleToggleSave = useCallback(async () => {
    if (savingInProgress) return;
    setSavingInProgress(true);
    try {
      if (isSaved) {
        await unsaveChart(metadata.md5);
        await deleteCachedChart(metadata.md5);
        setIsSaved(false);
        toast.success('Chart removed');
      } else {
        const toastId = toast.loading(`Downloading "${metadata.name}"...`);
        try {
          if (!(await isChartCached(metadata.md5))) {
            await fetchAndCacheChart(metadata.md5);
          }
          await saveChart(metadata);
          setIsSaved(true);
          toast.success(`"${metadata.name}" saved for offline use`, {id: toastId});
        } catch (err) {
          toast.error(`Failed to download "${metadata.name}"`, {id: toastId});
          throw err;
        }
      }
    } catch (err) {
      console.error('Failed to toggle save:', err);
    } finally {
      setSavingInProgress(false);
    }
  }, [metadata, isSaved, savingInProgress]);

  // Practice mode state
  const [practiceMode, setPracticeMode] = useState<PracticeModeConfig | null>(null);
  const [practiceStartMs, setPracticeStartMs] = useState<number | null>(null);
  const [practiceEndMs, setPracticeEndMs] = useState<number | null>(null);
  const [showSections, setShowSections] = useState(true);
  const [showPatterns, setShowPatterns] = useState(false);
  const [highlightedPatternId, setHighlightedPatternId] = useState<string | null>(null);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  // Multi-section selection: first click sets anchor, second click sets range
  const [sectionAnchor, setSectionAnchor] = useState<number | null>(null);

  // Tempo control state
  const [tempo, setTempo] = useState(1.0);

  // Zoom control state
  const [zoom, setZoom] = useState(1.0);

  const availableDifficulties = getDrumDifficulties(chart);
  const [selectedDifficulty, setSelectedDifficulty] = useState(
    availableDifficulties[0],
  );

  const audioManagerRef = useRef<AudioManager | null>(null);

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
    updateClock,
  } = useYoutubeSync({songKey: metadata.md5, clockRef: audioManagerRef, tempo});

  // Songs with only a single audio file (e.g. "song.ogg") don't have individual
  // instrument stems, so we offer synthetic drum playback for those.
  const hasIndividualStems = audioFiles.length > 1;

  const handleMasterClickVolumeChange = (value: number) => {
    if (playClickTrack) {
      audioManagerRef.current?.setVolume('click', value);
    }
    setMasterClickVolume(value);
  };

  const updatePlayClickTrack = (value: boolean) => {
    audioManagerRef.current?.setVolume('click', value ? masterClickVolume : 0);
    setPlayClickTrack(value);
  };

  const handleMasterVolumeChange = (value: number) => {
    setMasterVolume(value);
    volumeControls.forEach(control => {
      audioManagerRef.current?.setVolume(
        control.trackName,
        control.volume * value,
      );
    });
  };

  const updatePlaySyntheticTrack = (value: boolean) => {
    audioManagerRef.current?.setVolume('synthetic', value ? syntheticVolume : 0);
    setPlaySyntheticTrack(value);
    // Mute/unmute all recorded tracks when toggling synthetic
    if (value) {
      setVolumeControls(prev =>
        prev.map(c =>
          c.isMuted ? c : {...c, volume: 0, previousVolume: c.volume, isMuted: true},
        ),
      );
    } else {
      setVolumeControls(prev =>
        prev.map(c => ({
          ...c,
          volume: c.previousVolume ?? 1,
          previousVolume: undefined,
          isMuted: false,
        })),
      );
    }
  };

  const handleSyntheticVolumeChange = (value: number) => {
    if (playSyntheticTrack) {
      audioManagerRef.current?.setVolume('synthetic', value);
    }
    setSyntheticVolume(value);
  };

  const handleClickVolumeChange = useMemo(
    () =>
      debounce((value: number, key: keyof typeof clickVolumes) => {
        setClickVolumes(prev => ({...prev, [key]: value}));
      }, 300),
    [setClickVolumes],
  );

  // Tempo control handlers
  const handleTempoChange = useCallback((newTempo: number) => {
    if (audioManagerRef.current) {
      audioManagerRef.current.setTempo(newTempo);
      setTempo(newTempo);
      youtubeSyncRef.current.onTempoChange(newTempo);
    }
  }, []);

  // Unified playback wrappers — keep AudioManager and YouTubeSync in lockstep
  const seekAndPlay = useCallback((timeSeconds: number) => {
    if (!audioManagerRef.current) return;
    audioManagerRef.current.play({time: timeSeconds});
    youtubeSyncRef.current.onPlay(timeSeconds);
    setIsPlaying(true);
    setCurrentPlayback(timeSeconds);
  }, []);

  const pausePlayback = useCallback(() => {
    if (!audioManagerRef.current) return;
    audioManagerRef.current.pause();
    youtubeSyncRef.current.onPause();
    setIsPlaying(false);
  }, []);

  const resumePlayback = useCallback(() => {
    if (!audioManagerRef.current) return;
    audioManagerRef.current.resume();
    youtubeSyncRef.current.onResume();
    setIsPlaying(true);
  }, []);

  // Zoom control handlers
  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  // Build enriched sections with end times from chart.sections
  const sections = useMemo(() => {
    const raw = (chart as any).sections as
      | {tick: number; name: string; msTime: number; msLength: number}[]
      | undefined;
    if (!raw || raw.length === 0) return [];
    return raw.map((section, i) => {
      const nextSection = raw[i + 1];
      const endMs = nextSection ? nextSection.msTime : section.msTime + section.msLength;
      return {
        name: section.name,
        startMs: section.msTime,
        endMs,
      };
    });
  }, [chart]);

  // Practice mode handlers
  const startPracticeSection = useCallback(
    (startMs: number, endMs: number) => {
      const BUFFER_MS = 500;
      const config: PracticeModeConfig = {
        startMeasureMs: startMs,
        endMeasureMs: endMs,
        startTimeMs: Math.max(0, startMs - BUFFER_MS),
        endTimeMs: endMs + BUFFER_MS,
      };
      setPracticeMode(config);
      setPracticeStartMs(startMs);
      setPracticeEndMs(endMs);
      audioManagerRef.current?.setPracticeMode(config);
      seekAndPlay(config.startTimeMs / 1000);
    },
    [],
  );

  const stopPracticeMode = useCallback(() => {
    setPracticeMode(null);
    setPracticeStartMs(null);
    setPracticeEndMs(null);
    setSectionAnchor(null);
    audioManagerRef.current?.setPracticeMode(null);
  }, []);

  const practiceSection = useCallback(
    (sectionIndex: number) => {
      const section = sections[sectionIndex];
      if (!section) return;
      setSectionAnchor(null);
      startPracticeSection(section.startMs, section.endMs);
    },
    [sections, startPracticeSection],
  );

  const practiceSectionRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const lo = Math.min(startIndex, endIndex);
      const hi = Math.max(startIndex, endIndex);
      const startSection = sections[lo];
      const endSection = sections[hi];
      if (!startSection || !endSection) return;
      setSectionAnchor(null);
      startPracticeSection(startSection.startMs, endSection.endMs);
    },
    [sections, startPracticeSection],
  );

  const handleSectionPracticeClick = useCallback(
    (index: number, shiftKey: boolean) => {
      if (shiftKey && sectionAnchor != null) {
        // Range selection
        practiceSectionRange(sectionAnchor, index);
      } else {
        // Set anchor for potential range, or single practice
        setSectionAnchor(index);
        practiceSection(index);
      }
    },
    [sectionAnchor, practiceSection, practiceSectionRange],
  );

  const handleCustomTimePractice = useCallback(() => {
    const startSec = parseTimeInput(customStartInput);
    const endSec = parseTimeInput(customEndInput);
    if (startSec == null || endSec == null || endSec <= startSec) return;
    startPracticeSection(startSec * 1000, endSec * 1000);
    setCustomTimeOpen(false);
  }, [customStartInput, customEndInput, startPracticeSection]);

  // Find which section is currently playing
  const currentSectionIndex = useMemo(() => {
    if (sections.length === 0) return -1;
    const currentMs = currentPlayback * 1000;
    for (let i = sections.length - 1; i >= 0; i--) {
      if (currentMs >= sections[i].startMs) return i;
    }
    return 0;
  }, [sections, currentPlayback]);

  const instrument = 'drums';

  const track: ParsedChart['trackData'][0] = useMemo(() => {
    const drumPart = chart.trackData.find(
      part =>
        part.instrument === instrument &&
        part.difficulty === selectedDifficulty,
    );
    if (!drumPart) {
      throw new Error('Unable to find difficulty');
    }
    return drumPart;
  }, [chart, selectedDifficulty, instrument]);

  const measures = useMemo(() => {
    return convertToVexFlow(chart, track);
  }, [chart, track]);

  const vocabulary = useMemo(
    () => buildPatternVocabulary(measures),
    [measures],
  );

  const patternMap = useMemo(() => {
    if (!showPatterns || !vocabulary) return undefined;
    const map = new Map<number, {color: string; label: string}>();
    for (const pattern of vocabulary.patterns) {
      for (const idx of pattern.measureIndices) {
        map.set(idx, {color: pattern.color, label: pattern.label});
      }
    }
    return map;
  }, [vocabulary, showPatterns]);

  const lastAudioState = useRef({
    currentTime: 0,
    wasPlaying: false,
  });

  // Load persisted settings on first mount
  const hasLoadedSettingsRef = useRef(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    if (hasLoadedSettingsRef.current) return;
    hasLoadedSettingsRef.current = true;
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed: PersistedSettings = JSON.parse(raw);

        if (parsed.playClickTrack !== undefined) {
          setPlayClickTrack(parsed.playClickTrack);
        }
        if (parsed.masterClickVolume !== undefined) {
          setMasterClickVolume(parsed.masterClickVolume);
        }
        if (parsed.clickVolumes) {
          setClickVolumes(prev => ({...prev, ...parsed.clickVolumes!}));
        }
        if (parsed.enableColors !== undefined) {
          setEnableColors(parsed.enableColors);
        }
        if (parsed.showLyrics !== undefined) {
          setShowLyrics(parsed.showLyrics);
        }
        if (parsed.viewCloneHero !== undefined) {
          setViewCloneHero(parsed.viewCloneHero);
        }
        if (parsed.showBarNumbers !== undefined) {
          setShowBarNumbers(parsed.showBarNumbers);
        }
        if (
          parsed.selectedDifficulty &&
          availableDifficulties.includes(parsed.selectedDifficulty)
        ) {
          setSelectedDifficulty(parsed.selectedDifficulty);
        }

        // Restore tempo if available
        if (parsed.tempo) {
          setTempo(parsed.tempo);
        }

        // Restore zoom if available
        if (parsed.zoom) {
          setZoom(parsed.zoom);
        }

        if (parsed.masterVolume !== undefined) {
          setMasterVolume(parsed.masterVolume);
        }
        if (parsed.playSyntheticTrack !== undefined) {
          setPlaySyntheticTrack(parsed.playSyntheticTrack);
        }
        if (parsed.syntheticVolume !== undefined) {
          setSyntheticVolume(parsed.syntheticVolume);
        }
        if (parsed.enabledDrumInstruments) {
          setEnabledDrumInstruments(new Set(parsed.enabledDrumInstruments));
        }
        if (parsed.showPatterns !== undefined) {
          setShowPatterns(parsed.showPatterns);
        }
      }
    } catch (e) {
      // noop on parse errors
    }
    setSettingsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist settings whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const settingsToPersist: PersistedSettings = {
      selectedDifficulty,
      playClickTrack,
      masterClickVolume,
      clickVolumes,
      showBarNumbers,
      enableColors,
      showLyrics,
      viewCloneHero,
      tempo,
      zoom,
      masterVolume,
      playSyntheticTrack,
      syntheticVolume,
      enabledDrumInstruments: [...enabledDrumInstruments],
      showPatterns,
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToPersist));
    } catch (e) {
      // ignore write errors
    }
  }, [
    selectedDifficulty,
    playClickTrack,
    masterClickVolume,
    clickVolumes,
    showBarNumbers,
    enableColors,
    showLyrics,
    viewCloneHero,
    tempo,
    zoom,
    masterVolume,
    playSyntheticTrack,
    syntheticVolume,
    enabledDrumInstruments,
    showPatterns,
  ]);

  useEffect(() => {
    // Wait for settings to be loaded before initializing audio manager
    if (!settingsLoaded) return;

    async function run() {
      const generatedTracks: {fileName: string; data: Uint8Array}[] = [
        {
          fileName: 'click.mp3',
          data: await generateClickTrackFromMeasures(measures, clickVolumes),
        },
      ];

      // Generate synthetic drum track for songs without individual stems
      if (!hasIndividualStems) {
        generatedTracks.push({
          fileName: 'synthetic.mp3',
          data: await generateSyntheticDrumTrack(measures, enabledDrumInstruments),
        });
      }

      const files = [...audioFiles, ...generatedTracks];

      const audioManager = new AudioManager(files, () => {
        setIsPlaying(false);
      });

      const processedTracks = new Set();
      let initialVolumeControls: VolumeControl[] = [];

      files.forEach(audioFile => {
        if (
          audioFile.fileName.includes('click') ||
          audioFile.fileName.includes('synthetic')
        ) {
          return;
        }
        const basename = getBasename(audioFile.fileName);
        const trackName = basename.includes('drums') ? 'drums' : basename;

        if (!processedTracks.has(trackName)) {
          processedTracks.add(trackName);
          initialVolumeControls.push({
            trackName,
            volume: 1,
            isMuted: false,
            isSoloed: false,
          });
        }
      });

      // Merge with any persisted track volumes
      try {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem(TRACK_SETTINGS_KEY);
          if (raw) {
            const persisted: Record<
              string,
              Partial<VolumeControl>
            > = JSON.parse(raw);
            initialVolumeControls = initialVolumeControls.map(control => {
              const saved = persisted[control.trackName];
              if (!saved) return control;
              return {
                ...control,
                ...saved,
                // Ensure required fields are present
                trackName: control.trackName,
                volume:
                  typeof saved.volume === 'number'
                    ? saved.volume
                    : control.volume,
                isMuted:
                  typeof saved.isMuted === 'boolean'
                    ? saved.isMuted
                    : control.isMuted,
                isSoloed:
                  typeof saved.isSoloed === 'boolean'
                    ? saved.isSoloed
                    : control.isSoloed,
                previousVolume:
                  typeof saved.previousVolume === 'number'
                    ? saved.previousVolume
                    : control.previousVolume,
              };
            });
          }
        }
      } catch {}

      setVolumeControls(initialVolumeControls);

      audioManager.ready.then(() => {
        if (audioManagerRef.current) {
          // This effect already ran and has been set up before we got here. Bail.
          return;
        }
        audioManager.setVolume('click', playClickTrack ? masterClickVolume : 0);
        if (!hasIndividualStems) {
          audioManager.setVolume('synthetic', playSyntheticTrack ? syntheticVolume : 0);
        }
        audioManagerRef.current = audioManager;
        updateClock(audioManager);
        if (import.meta.env.DEV) (window as any).am = audioManager;

        // Apply initial per-track volumes loaded from storage
        try {
          initialVolumeControls.forEach(control => {
            audioManager.setVolume(control.trackName, control.volume);
          });
        } catch {}

        // Apply initial tempo configuration
        try {
          audioManager.setTempo(tempo);
        } catch {}

        if (lastAudioState.current.wasPlaying) {
          audioManager.play({time: lastAudioState.current.currentTime});
          setIsPlaying(true);
        }
      });
    }
    run();

    return () => {
      lastAudioState.current = {
        currentTime: audioManagerRef.current?.currentTime ?? 0,
        wasPlaying: audioManagerRef.current?.isPlaying ?? false,
      };
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
  }, [
    audioFiles,
    measures,
    clickVolumes,
    playClickTrack,
    masterClickVolume,
    settingsLoaded,
    hasIndividualStems,
    enabledDrumInstruments,
  ]);

  useInterval(
    () => {
      audioManagerRef.current?.checkPracticeModeLoop();
      setCurrentPlayback(audioManagerRef.current?.currentTime ?? 0);
    },
    isPlaying ? 100 : null,
  );

  useEffect(() => {
    if (volumeControls.length === 0 || audioManagerRef.current == null) {
      return;
    }

    volumeControls.forEach(control => {
      audioManagerRef.current?.setVolume(
        control.trackName,
        control.volume * masterVolume,
      );
    });
  }, [volumeControls, audioManagerRef, masterVolume]);

  // Persist per-track volumes whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const map: Record<string, Partial<VolumeControl>> = {};
      for (const vc of volumeControls) {
        map[vc.trackName] = {
          volume: vc.volume,
          isMuted: vc.isMuted,
          isSoloed: vc.isSoloed,
          previousVolume: vc.previousVolume,
        };
      }
      localStorage.setItem(TRACK_SETTINGS_KEY, JSON.stringify(map));
    } catch {}
  }, [volumeControls]);

  // Update document title when metadata changes
  useEffect(() => {
    if (metadata?.name && metadata?.artist) {
      document.title = `${metadata.name} by ${metadata.artist} - Chartmate`;
    }
  }, [metadata]);


  const handlePlay = useCallback(() => {
    if (!audioManagerRef.current) return;

    if (isPlaying) {
      pausePlayback();
    } else if (!audioManagerRef.current.isInitialized) {
      seekAndPlay(0);
    } else {
      resumePlayback();
    }
  }, [isPlaying, pausePlayback, seekAndPlay, resumePlayback]);

  // Keyboard shortcuts: Space = play/pause, Left/Right = speed control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newTempo = Math.max(tempo - 0.1, 0.25);
        handleTempoChange(Math.round(newTempo * 100) / 100);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newTempo = Math.min(tempo + 0.1, 4.0);
        handleTempoChange(Math.round(newTempo * 100) / 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlay, tempo, handleTempoChange]);

  const songDuration =
    metadata.song_length == null ? 5 * 60 : metadata.song_length / 1000;

  const difficultySelectorOnSelect = useCallback(
    (selectedDifficulty: string) => {
      setSelectedDifficulty(selectedDifficulty as Difficulty);
    },
    [],
  );

  const volumeSliders = useMemo(() => {
    if (volumeControls.length === 0) {
      return [];
    }

    return volumeControls
      .sort((a, b) => a.trackName.localeCompare(b.trackName))
      .map(control => {
        return (
          <AudioVolume
            key={control.trackName}
            name={control.trackName}
            volume={control.volume}
            isMuted={control.isMuted}
            isSoloed={control.isSoloed}
            onMuteClick={() => {
              if (control.isMuted) {
                setVolumeControls([
                  ...volumeControls.filter(c => c !== control),
                  {
                    ...control,
                    volume: control.previousVolume ?? 100,
                    previousVolume: undefined,
                    isMuted: false,
                  },
                ]);
              } else {
                setVolumeControls([
                  ...volumeControls.filter(c => c !== control),
                  {
                    ...control,
                    volume: 0,
                    previousVolume: control.volume,
                    isMuted: true,
                  },
                ]);
              }
            }}
            onSoloClick={() => {
              const otherControls = volumeControls.filter(c => c !== control);

              if (otherControls.filter(c => c.isSoloed).length > 0) {
                if (control.isSoloed) {
                  setVolumeControls([
                    ...otherControls,
                    {
                      ...control,
                      isSoloed: false,
                      isMuted: true,
                      volume: 0,
                      previousVolume: control.volume,
                    },
                  ]);
                } else {
                  setVolumeControls([
                    ...otherControls,
                    {
                      ...control,
                      isSoloed: true,
                      isMuted: false,
                      volume: control.previousVolume ?? 100,
                      previousVolume: undefined,
                    },
                  ]);
                }

                return;
              }

              if (control.isSoloed) {
                setVolumeControls([
                  ...otherControls.map(c => ({
                    ...c,
                    isMuted: false,
                    previousVolume: undefined,
                    volume: c.previousVolume ?? 100,
                  })),
                  {
                    ...control,
                    isSoloed: false,
                  },
                ]);
              } else {
                setVolumeControls([
                  ...otherControls.map(c => ({
                    ...c,
                    isMuted: true,
                    previousVolume: c.volume,
                    volume: 0,
                  })),
                  {
                    ...control,
                    isSoloed: true,
                  },
                ]);
              }
            }}
            onChange={value => {
              setVolumeControls([
                ...volumeControls.filter(c => c !== control),
                {...control, volume: value},
              ]);
            }}
          />
        );
      });
  }, [volumeControls]);

  // Define reusable control elements
  const backButton = (
    <Tip label="Back to search">
      <Link to="/sheet-music">
        <Button variant="ghost" size="icon" className="rounded-full">
          <ArrowLeft className="h-6 w-6" />
        </Button>
      </Link>
    </Tip>
  );

  const saveButton = (
    <Tip label={isSaved ? 'Remove from saved' : 'Save for offline'}>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={handleToggleSave}
        disabled={savingInProgress}
      >
        {savingInProgress ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Bookmark
            className={cn(
              'h-6 w-6 transition-colors',
              isSaved ? 'fill-primary text-primary' : '',
            )}
          />
        )}
      </Button>
    </Tip>
  );

  const playPauseButton = (
    <Tip label={isPlaying ? 'Pause' : 'Play'}>
      <Button
        size="icon"
        variant="secondary"
        className="rounded-full"
        onClick={handlePlay}>
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </Button>
    </Tip>
  );

  const maximizeButton = (
    <Tip label={isMobileMode ? 'Exit compact mode' : 'Compact mode'}>
      <Button
        size="icon"
        variant="secondary"
        className={cn(
          'rounded-full',
          isMobileMode && 'inline-flex',
          !isMobileMode && 'md:inline-flex hidden',
        )}
        onClick={() => setIsMobileMode(!isMobileMode)}>
        {isMobileMode ? (
          <Minimize2 className="h-6 w-6" />
        ) : (
          <Maximize2 className="h-6 w-6" />
        )}
      </Button>
    </Tip>
  );

  const menuToggleButton = (
    <Tip label={isSidebarOpen ? 'Close menu' : 'Open menu'}>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>
    </Tip>
  );

  return (
    <TooltipProvider delayDuration={300}>
    <div
      className={cn(
        'flex flex-col w-full flex-1 min-h-0',
        !isMobileMode && 'md:overflow-hidden',
      )}>
      <div
        className={cn(
          'flex flex-col flex-1 min-h-0 bg-background relative',
          // Normal desktop behavior
          'md:flex-row md:overflow-hidden',
          // Mobile mode on desktop - allow scrolling
          isMobileMode && 'md:overflow-visible',
        )}>
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className={cn(
              'fixed inset-0 bg-black/50 z-30',
              // Show on mobile OR when in mobile mode
              'md:hidden',
              isMobileMode && 'md:block',
            )}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar */}
        <div
          className={cn(
            'w-64 border-r p-4 flex flex-col gap-6 bg-background z-40',
            'transition-transform duration-300 ease-in-out',
            // Mobile behavior (always)
            'fixed inset-y-0 left-0',
            // Desktop behavior - static unless in mobile mode
            !isMobileMode && 'md:static md:translate-x-0 md:h-full',
            // Mobile mode on desktop - use mobile behavior
            isMobileMode && 'md:fixed md:inset-y-0 md:left-0',
            // Show/hide logic
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}>
          <div className="md:flex hidden items-center gap-2">
            {backButton}
            {playPauseButton}
            {maximizeButton}
            {saveButton}
          </div>

          <div className="space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium">Difficulty</label>
              <Select
                value={selectedDifficulty}
                onValueChange={difficultySelectorOnSelect}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableDifficulties.map(difficulty => (
                    <SelectItem key={difficulty} value={difficulty}>
                      {capitalize(difficulty)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Master Volume</label>
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              <Slider
                value={[masterVolume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => handleMasterVolumeChange(v)}
              />
            </div>

            {volumeSliders}

            <div className="space-y-4 pt-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="clicktrack"
                  checked={playClickTrack}
                  onCheckedChange={updatePlayClickTrack}
                />
                <label htmlFor="clicktrack" className="text-sm font-medium">
                  Enable click track
                </label>
                <Tip label="Configure click track">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setClickTrackConfigurationOpen(true)}>
                    <Settings2 className="h-3 w-3" />
                  </Button>
                </Tip>
                <ClickDialog
                  open={clickTrackConfigurationOpen}
                  setOpen={setClickTrackConfigurationOpen}
                  clickVolumes={clickVolumes}
                  handleClickVolumeChange={handleClickVolumeChange}
                  masterClickVolume={masterClickVolume}
                  setMasterClickVolume={handleMasterClickVolumeChange}
                />
              </div>
              {!hasIndividualStems && (
                <SyntheticDrumControls
                  enabled={playSyntheticTrack}
                  onEnabledChange={updatePlaySyntheticTrack}
                  volume={syntheticVolume}
                  onVolumeChange={handleSyntheticVolumeChange}
                  enabledInstruments={enabledDrumInstruments}
                  onEnabledInstrumentsChange={setEnabledDrumInstruments}
                />
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  id="colors"
                  checked={enableColors}
                  onCheckedChange={setEnableColors}
                />
                <label htmlFor="colors" className="text-sm font-medium">
                  Enable colors
                </label>
              </div>
              {(chart as any).lyrics == null ? null : (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="lyrics"
                    checked={showLyrics}
                    onCheckedChange={setShowLyrics}
                  />
                  <label htmlFor="lyrics" className="text-sm font-medium">
                    Show lyrics
                  </label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  id="clonehero"
                  checked={viewCloneHero}
                  onCheckedChange={setViewCloneHero}
                />
                <label htmlFor="clonehero" className="text-sm font-medium">
                  View as Clone Hero
                </label>
              </div>
              {import.meta.env.MODE === 'development' && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="measurenumbers"
                    checked={showBarNumbers}
                    onCheckedChange={setShowBarNumbers}
                  />
                  <label
                    htmlFor="measurenumbers"
                    className="text-sm font-medium">
                    Show measure numbers
                  </label>
                </div>
              )}
            </div>

            {/* Tempo Control */}
            <TempoControl
              tempo={tempo}
              onTempoChange={handleTempoChange}
              min={0.25}
              max={4.0}
              step={0.1}
            />

            {/* Zoom Control */}
            <ZoomControl zoom={zoom} onZoomChange={handleZoomChange} />

            {/* YouTube Integration */}
            <div className="space-y-2 pt-4 border-t">
              <span className="text-sm font-medium flex items-center gap-1">
                <Youtube className="h-3.5 w-3.5" />
                YouTube
              </span>
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
                      <label className="text-xs text-muted-foreground">
                        Offset
                      </label>
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
                  {tempo !== 1.0 && snapToYouTubeRate(tempo) !== tempo && (
                    <p className="text-xs text-amber-500">
                      YT rate: {snapToYouTubeRate(tempo)}x (closest to {tempo.toFixed(2)}x)
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

            {/* Practice Mode */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5" />
                  Practice
                </span>
                <div className="flex items-center gap-1">
                  <Tip label="Practice a custom time range">
                    <Button
                      variant={customTimeOpen ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setCustomTimeOpen(!customTimeOpen)}>
                      <Timer className="h-3 w-3" />
                    </Button>
                  </Tip>
                  {practiceMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={stopPracticeMode}>
                      Stop
                    </Button>
                  )}
                </div>
              </div>
              {practiceMode && (
                <PracticeTimeEditor
                  practiceStartMs={practiceStartMs ?? 0}
                  practiceEndMs={practiceEndMs ?? 0}
                  onApply={startPracticeSection}
                />
              )}
              {/* Custom time range practice */}
              {customTimeOpen && (
                <div className="space-y-2 p-2 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground">Enter times as M:SS or seconds</p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="0:00"
                      value={customStartInput}
                      onChange={e => setCustomStartInput(e.target.value)}
                      className="w-16 text-xs px-2 py-1 rounded border bg-background"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="text"
                      placeholder="0:30"
                      value={customEndInput}
                      onChange={e => setCustomEndInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCustomTimePractice();
                      }}
                      className="w-16 text-xs px-2 py-1 rounded border bg-background"
                    />
                    <Tip label="Start practice loop">
                      <Button
                        variant="default"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleCustomTimePractice}>
                        <Play className="h-3 w-3" />
                      </Button>
                    </Tip>
                  </div>
                  {/* Quick-fill from current playback position */}
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setCustomStartInput(formatSeconds(currentPlayback))}>
                      Set start to now
                    </button>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setCustomEndInput(formatSeconds(currentPlayback))}>
                      Set end to now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sections Index */}
            {sections.length > 0 && (
              <div className="pt-4 border-t flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <List className="h-3.5 w-3.5" />
                    Sections
                  </span>
                  <Tip label={showSections ? 'Collapse sections' : 'Expand sections'}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setShowSections(!showSections)}>
                      <ChevronRight className={cn('h-3 w-3 transition-transform', showSections && 'rotate-90')} />
                    </Button>
                  </Tip>
                </div>
                {sectionAnchor != null && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Hold Shift + click another section to practice a range
                  </p>
                )}
                {showSections && (
                  <div className="space-y-0.5 overflow-y-auto max-h-48">
                    {sections.map((section, i) => {
                      const isInPracticeRange =
                        practiceMode &&
                        practiceStartMs != null &&
                        practiceEndMs != null &&
                        section.startMs >= practiceStartMs &&
                        section.startMs < practiceEndMs;
                      const isAnchor = sectionAnchor === i;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'flex items-center gap-1 text-xs rounded px-1.5 py-1 cursor-pointer hover:bg-accent transition-colors group',
                            currentSectionIndex === i && 'bg-accent/50 font-medium',
                            isInPracticeRange && 'ring-1 ring-primary/40',
                            isAnchor && !practiceMode && 'ring-1 ring-primary/60 bg-primary/5',
                          )}>
                          <button
                            className="flex-1 text-left truncate"
                            onClick={() => seekAndPlay(section.startMs / 1000)}>
                            {section.name}
                          </button>
                          <span className="text-muted-foreground shrink-0">
                            {formatSeconds(section.startMs / 1000)}
                          </span>
                          <Tip label="Practice on loop (Shift+click for range)">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                              onClick={e => {
                                e.stopPropagation();
                                handleSectionPracticeClick(i, e.shiftKey);
                              }}>
                              <Repeat className="h-3 w-3" />
                            </Button>
                          </Tip>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Pattern Vocabulary */}
            {vocabulary.uniqueCount > 0 && (
              <div className="pt-4 border-t flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Grid3X3 className="h-3.5 w-3.5" />
                    Patterns
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({vocabulary.uniqueCount})
                    </span>
                  </span>
                  <Tip label={showPatterns ? 'Hide patterns' : 'Show patterns'}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setShowPatterns(!showPatterns)}>
                      <ChevronRight className={cn('h-3 w-3 transition-transform', showPatterns && 'rotate-90')} />
                    </Button>
                  </Tip>
                </div>
                {showPatterns && (
                  <PatternVocabularyPanel
                    vocabulary={vocabulary}
                    onPracticePattern={patternId => {
                      const pattern = vocabulary.patterns.find(p => p.id === patternId);
                      if (pattern) {
                        startPracticeSection(pattern.startMs, pattern.endMs);
                      }
                    }}
                    onHighlightPattern={setHighlightedPatternId}
                    highlightedPatternId={highlightedPatternId}
                    currentPlaybackMs={currentPlayback * 1000}
                  />
                )}
              </div>
            )}

          </div>
        </div>

        {/* Main Content */}
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0',
            // Normal desktop behavior - hide overflow
            'md:overflow-hidden',
            // Mobile mode on desktop - allow scrolling
            isMobileMode && 'md:overflow-visible',
          )}>
          {/* Mobile controls - sticky on scroll */}
          <div
            className={cn(
              'sticky top-0 z-30 flex items-center gap-2 md:px-4 py-3 border-b bg-background/95 backdrop-blur-sm',
              // Show on mobile OR when in mobile mode
              'md:hidden',
              isMobileMode && 'md:flex',
            )}>
            {backButton}
            {playPauseButton}
            {maximizeButton}
            {saveButton}
            <div className="ml-auto">{menuToggleButton}</div>
          </div>

          <div
            className={cn(
              'h-12 border-b flex items-center md:px-4 gap-4 bg-background/95 backdrop-blur-sm',
              // Normal behavior: static on desktop, sticky on mobile
              'sticky top-[60px] z-30',
              // If not in mobile mode, then it's just static, otherwise it's sticky
              !isMobileMode && 'md:static',
            )}>
            <div className="flex-1 relative">
              {practiceMode && songDuration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-2 bg-primary/20 rounded-full pointer-events-none z-0"
                  style={{
                    left: `${((practiceMode.startMeasureMs / 1000) / songDuration) * 100}%`,
                    width: `${(((practiceMode.endMeasureMs - practiceMode.startMeasureMs) / 1000) / songDuration) * 100}%`,
                  }}
                />
              )}
              <Slider
                value={[currentPlayback]}
                max={songDuration || 100}
                min={0}
                className="relative z-10"
                onValueChange={values => seekAndPlay(values[0])}
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {formatSeconds(currentPlayback)} /{' '}
              {formatSeconds((metadata.song_length || 0) / 1000)}
            </span>
            {practiceMode && (
              <Tip label="Stop practice mode">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={stopPracticeMode}>
                  <Repeat className="h-4 w-4 text-primary" />
                </Button>
              </Tip>
            )}
          </div>

          <div className="md:pt-4 md:px-4 pt-2 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <h1 className="text-3xl md:text-3xl font-bold">
                {metadata.name}{' '}
                <span className="text-muted-foreground">by</span>{' '}
                {metadata.artist}
                <div className="text-sm text-gray-600 dark:text-gray-400 font-normal">
                  Charted by {metadata.charter}
                </div>
              </h1>
            </div>
            {/* YouTube Video Panel */}
            {youtubeVideoId && (
              <div className="mb-2 rounded-lg overflow-hidden border bg-black" style={{height: '240px'}}>
                <YouTubePlayer
                  ref={youtubePlayerRef}
                  videoId={youtubeVideoId}
                  onReady={handleYoutubeReady}
                  className="w-full h-full"
                />
              </div>
            )}
            <div className="flex flex-1 gap-2 overflow-hidden">
              <div
                className={cn(
                  viewCloneHero ? 'hidden md:flex' : 'flex',
                  'flex-1',
                )}>
                <SheetMusic
                  currentTime={currentPlayback}
                  chart={chart}
                  track={track}
                  showBarNumbers={showBarNumbers}
                  enableColors={enableColors}
                  showLyrics={showLyrics}
                  zoom={zoom}
                  onSelectMeasure={seekAndPlay}
                  triggerRerender={
                    String(viewCloneHero) + String(isMobileMode) + String(zoom)
                  }
                  audioManagerRef={audioManagerRef}
                  patternMap={patternMap}
                />
              </div>
              {viewCloneHero && (
                <CloneHeroRenderer
                  metadata={metadata}
                  chart={chart}
                  track={track}
                  audioManager={audioManagerRef.current!}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function AudioVolume({
  name,
  volume,
  onChange,
  isMuted,
  isSoloed,
  onMuteClick,
  onSoloClick,
}: {
  name: string;
  volume: number;
  isMuted: boolean;
  isSoloed: boolean;
  onChange: (value: number) => void;
  onMuteClick: () => void;
  onSoloClick: () => void;
}) {
  return (
    <div key={name} className="space-y-2">
      <label className="text-sm font-medium">{capitalize(name)}</label>
      <div className="flex items-center gap-2">
        <Slider
          defaultValue={[volume]}
          min={0}
          max={1}
          step={0.01}
          className="flex-1"
          onValueChange={values => onChange(values[0])}
        />
        <div className="flex gap-1">
          <Tip label={isMuted ? 'Unmute' : 'Mute'}>
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6"
              onClick={onMuteClick}>
              {isMuted ? (
                <VolumeX className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </Button>
          </Tip>
          <Tip label={isSoloed ? 'Unsolo' : 'Solo'}>
            <Button
              variant={isSoloed ? 'secondary' : 'outline'}
              size="icon"
              className="h-6 w-6"
              onClick={onSoloClick}>
              S
            </Button>
          </Tip>
        </div>
      </div>
    </div>
  );
}

function ClickDialog({
  open,
  setOpen,
  clickVolumes,
  handleClickVolumeChange,
  masterClickVolume,
  setMasterClickVolume,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  clickVolumes: ClickVolumes;
  handleClickVolumeChange: (value: number, key: keyof ClickVolumes) => void;
  masterClickVolume: number;
  setMasterClickVolume: (value: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-medium">
            Configure Click Track
          </DialogTitle>
        </DialogHeader>

        {/* Mobile layout - stacked with horizontal sliders */}
        <div className="flex flex-col space-y-6 pt-4">
          {/* Master Volume */}
          <ClickVolume
            name="Master"
            volume={masterClickVolume}
            onChange={val => setMasterClickVolume(val)}
          />

          {/* Separator */}
          <div className="h-px w-full bg-border my-2"></div>

          {/* Whole Note */}
          <ClickVolume
            svgSrc="/assets/svgs/whole-note.svg"
            volume={clickVolumes.wholeNote}
            onChange={val => handleClickVolumeChange(val, 'wholeNote')}
          />

          {/* Quarter Note */}
          <ClickVolume
            svgSrc="/assets/svgs/quarter-note.svg"
            volume={clickVolumes.quarterNote}
            onChange={val => handleClickVolumeChange(val, 'quarterNote')}
          />

          {/* Eighth Note */}
          <ClickVolume
            svgSrc="/assets/svgs/eighth-note.svg"
            volume={clickVolumes.eighthNote}
            onChange={val => handleClickVolumeChange(val, 'eighthNote')}
          />

          {/* Triplet */}
          <ClickVolume
            svgSrc="/assets/svgs/triplet-note.svg"
            volume={clickVolumes.tripletNote}
            onChange={val => handleClickVolumeChange(val, 'tripletNote')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClickVolume({
  name,
  svgSrc,
  volume,
  onChange,
}: {
  name?: string;
  svgSrc?: string;
  volume: number;
  onChange: (value: number) => void;
}) {
  const description = name ? (
    <span>{capitalize(name)}</span>
  ) : (
    <img
      src={svgSrc}
      alt="Note"
      className="foreground h-[26px] max-w-[30px]"
    />
  );
  return (
    <div key={name} className="space-y-2">
      <label className="text-sm font-medium">{description}</label>
      <div className="flex items-center gap-2">
        <Slider
          defaultValue={[volume]}
          min={0}
          max={1}
          step={0.01}
          className="flex-1"
          onValueChange={values => onChange(values[0])}
        />
      </div>
    </div>
  );
}

function PracticeTimeEditor({
  practiceStartMs,
  practiceEndMs,
  onApply,
}: {
  practiceStartMs: number;
  practiceEndMs: number;
  onApply: (startMs: number, endMs: number) => void;
}) {
  const [editStart, setEditStart] = useState(formatSeconds(practiceStartMs / 1000));
  const [editEnd, setEditEnd] = useState(formatSeconds(practiceEndMs / 1000));

  // Sync when external values change (e.g. section clicked)
  useEffect(() => {
    setEditStart(formatSeconds(practiceStartMs / 1000));
  }, [practiceStartMs]);
  useEffect(() => {
    setEditEnd(formatSeconds(practiceEndMs / 1000));
  }, [practiceEndMs]);

  const apply = () => {
    const startSec = parseTimeInput(editStart);
    const endSec = parseTimeInput(editEnd);
    if (startSec != null && endSec != null && endSec > startSec) {
      onApply(startSec * 1000, endSec * 1000);
    }
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Looping</span>
      <input
        type="text"
        value={editStart}
        onChange={e => setEditStart(e.target.value)}
        onBlur={apply}
        onKeyDown={e => { if (e.key === 'Enter') apply(); }}
        className="w-12 text-xs px-1 py-0.5 rounded border bg-background text-center"
      />
      <span>-</span>
      <input
        type="text"
        value={editEnd}
        onChange={e => setEditEnd(e.target.value)}
        onBlur={apply}
        onKeyDown={e => { if (e.key === 'Enter') apply(); }}
        className="w-12 text-xs px-1 py-0.5 rounded border bg-background text-center"
      />
    </div>
  );
}
