import {useCallback, useEffect, useMemo, useState} from 'react';
import {cn} from '@/lib/utils';
import {
  Plus, Trash2, Guitar, Drum, Volume2, VolumeOff,
  RefreshCw, Play, ChevronDown, ChevronRight, X,
  BookOpen, Layers, Palette, Music2, TableProperties,
  Bookmark, BookMarked, Hand, Wand2, AudioLines, ListMusic, Settings2,
} from 'lucide-react';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {
  DEFAULT_SIDEBAR_SECTIONS,
  SIDEBAR_SECTIONS_KEY,
  parseSidebarSections,
  type SidebarSectionId,
  type SidebarSectionState,
} from '@/lib/tab-editor/practiceSettings';
import {
  createItem,
  deleteItem,
  findItemByCompositionPattern,
  findItemByCompositionTabSection,
  patternNotesFor,
  tabSectionNotesFor,
} from '@/lib/local-db/repertoire';
import {KEYS, DEGREES, getKeyInfo} from '@/lib/tab-editor/keyData';
import {getTuningsForInstrument, getDefaultTuningPreset, type TuningPreset} from '@/lib/tab-editor/tunings';
import type {InstrumentType} from '@/lib/tab-editor/newScore';
import StemMixerPanel, {type StemMixerPanelProps} from '@/components/StemMixerPanel';
import SongLearningPanel from '@/components/SongLearningPanel';
import type {DetectedPattern} from '@/lib/tab-editor/patternDetector';
import type {TabSection} from '@/lib/tab-editor/scoreOperations';
import {PATTERN_COLORS, MAX_TEMPO_BPM} from './patternColors';

interface TrackInfo {
  name: string;
  instrument: InstrumentType;
  stringCount: number;
  tuningName: string;
}

interface TabEditorSidebarProps {
  tracks: TrackInfo[];
  activeTrackIndex: number;
  /** Composition row id once saved. `null` while the user is still editing a fresh tab. */
  compositionId: number | null;
  onTrackSelect: (index: number) => void;
  onAddTrack: (instrument: InstrumentType, stringCount: number) => void;
  onRemoveTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  mutedTracks: Set<number>;
  onTuningChange: (trackIndex: number, tuning: number[]) => void;
  tempo: number;
  onTempoChange: (bpm: number) => void;
  title: string;
  onTitleChange: (title: string) => void;
  artist: string;
  onArtistChange: (artist: string) => void;
  stemPlayer: Omit<StemMixerPanelProps, 'compact'>;
  // sections & patterns
  sections: TabSection[];
  detectedPatterns: DetectedPattern[];
  totalBars: number;
  practiceRange: {startBar: number; endBar: number} | null;
  onDetectPatterns: () => void;
  onAddSection: (startBar: number, name: string) => void;
  onRemoveSection: (startBar: number) => void;
  onPracticeRange: (startBar: number, endBar: number) => void;
  onJumpToBar: (barIndex: number) => void;
  showPatternColors: boolean;
  onTogglePatternColors: () => void;
  selectedKey: string | null;
  onKeyChange: (key: string | null) => void;
  onOpenKeyChart: () => void;
  /** Fingering display toggle — p i m a / 1-4 drawn on the score. */
  showFingering: boolean;
  onToggleFingering: () => void;
  onAutoRightHandFingering: (scope: 'selection' | 'track') => void;
  onClearTrackFingering: () => void;
  hasBarSelection: boolean;
  /** Strumming pattern strip toggle — shown above the canvas. */
  showStrumming: boolean;
  onToggleStrumming: () => void;
  /**
   * View mode. Every control that writes to the score is hidden or disabled;
   * playback, navigation, practice tracking and the display toggles stay.
   */
  readOnly?: boolean;
}

/**
 * One collapsible sidebar section. The sidebar is a single scroll area, so a
 * closed section costs one header row — that is the vertical space being
 * reclaimed. `headerExtra` sits outside the toggle button because nesting a
 * button inside a button is invalid HTML.
 */
function SidebarSection({
  icon: Icon,
  title,
  open,
  onToggle,
  badge,
  headerExtra,
  children,
}: {
  icon: typeof Guitar;
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-outline-variant/20">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2 font-bold text-on-surface-variant uppercase tracking-wider hover:bg-surface-container-high transition-colors"
          onClick={onToggle}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="flex-1 text-left text-xs truncate">{title}</span>
          {badge}
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        </button>
        {headerExtra && <div className="pr-2 shrink-0">{headerExtra}</div>}
      </div>
      {open && children}
    </div>
  );
}

export default function TabEditorSidebar({
  tracks,
  activeTrackIndex,
  compositionId,
  onTrackSelect,
  onAddTrack,
  onRemoveTrack,
  onToggleMute,
  mutedTracks,
  onTuningChange,
  tempo,
  onTempoChange,
  title,
  onTitleChange,
  artist,
  onArtistChange,
  stemPlayer,
  sections,
  detectedPatterns,
  totalBars,
  practiceRange,
  onDetectPatterns,
  onAddSection,
  onRemoveSection,
  onPracticeRange,
  onJumpToBar,
  showPatternColors,
  onTogglePatternColors,
  selectedKey,
  onKeyChange,
  onOpenKeyChart,
  showFingering,
  onToggleFingering,
  onAutoRightHandFingering,
  onClearTrackFingering,
  hasBarSelection,
  showStrumming,
  onToggleStrumming,
  readOnly = false,
}: TabEditorSidebarProps) {
  const [showAddTrack, setShowAddTrack] = useState(false);
  // Which sections are open survives reloads — the sidebar is a practice
  // surface and re-opening the same three panels every session is friction.
  const [storedSections, setStoredSections] = useLocalStorage<SidebarSectionState>(
    SIDEBAR_SECTIONS_KEY,
    DEFAULT_SIDEBAR_SECTIONS,
  );
  const openSections = useMemo(() => parseSidebarSections(storedSections), [storedSections]);
  const toggleSection = useCallback((id: SidebarSectionId) => {
    setStoredSections(prev => {
      const current = parseSidebarSections(prev);
      return {...current, [id]: !current[id]};
    });
  }, [setStoredSections]);
  const [tempoInput, setTempoInput] = useState(String(tempo));
  const [trackedPatterns, setTrackedPatterns] = useState<Set<string>>(new Set());
  const [trackedTabSections, setTrackedTabSections] = useState<Set<string>>(new Set());

  const refreshTrackedPatterns = useCallback(async () => {
    if (compositionId == null) {
      setTrackedPatterns(new Set());
      return;
    }
    const tracked = new Set<string>();
    await Promise.all(detectedPatterns.map(async p => {
      const found = await findItemByCompositionPattern(compositionId, p.label);
      if (found) tracked.add(p.label);
    }));
    setTrackedPatterns(tracked);
  }, [compositionId, detectedPatterns]);

  const refreshTrackedTabSections = useCallback(async () => {
    if (compositionId == null) {
      setTrackedTabSections(new Set());
      return;
    }
    const tracked = new Set<string>();
    await Promise.all(sections.map(async s => {
      const found = await findItemByCompositionTabSection(compositionId, s.name);
      if (found) tracked.add(s.name);
    }));
    setTrackedTabSections(tracked);
  }, [compositionId, sections]);

  useEffect(() => {
    void refreshTrackedPatterns();
  }, [refreshTrackedPatterns]);

  useEffect(() => {
    void refreshTrackedTabSections();
  }, [refreshTrackedTabSections]);

  const togglePatternTracking = useCallback(async (pattern: DetectedPattern) => {
    if (compositionId == null) return;
    const existing = await findItemByCompositionPattern(compositionId, pattern.label);
    if (existing) {
      await deleteItem(existing.id);
    } else {
      const extra = pattern.barLength > 1
        ? `${pattern.barLength} bars · ${pattern.instances.length} instance${pattern.instances.length === 1 ? '' : 's'}`
        : `1 bar · ${pattern.instances.length} instance${pattern.instances.length === 1 ? '' : 's'}`;
      // First instance becomes the "preview range" so RepertoireIQ can render a snippet later.
      const firstInstance = pattern.instances[0];
      await createItem({
        itemType: 'composition',
        title: `Pattern ${pattern.label}${title ? ` — ${title}` : ''}`,
        compositionId,
        notes: patternNotesFor(pattern.label, {
          extra,
          // pattern.instances bars are 0-based; AlphaTab's display.startBar is 1-based.
          startBar: firstInstance + 1,
          barCount: pattern.barLength,
        }),
      });
    }
    await refreshTrackedPatterns();
  }, [compositionId, refreshTrackedPatterns, title]);

  const toggleTabSectionTracking = useCallback(async (sec: TabSection) => {
    if (compositionId == null) return;
    const existing = await findItemByCompositionTabSection(compositionId, sec.name);
    if (existing) {
      await deleteItem(existing.id);
    } else {
      const extra = `bars ${sec.startBar + 1}–${sec.endBar + 1}`;
      const barCount = Math.max(1, sec.endBar - sec.startBar + 1);
      await createItem({
        itemType: 'composition',
        title: `${sec.name}${title ? ` — ${title}` : ''}`,
        compositionId,
        notes: tabSectionNotesFor(sec.name, {
          extra,
          // Sidebar `TabSection` bars are 0-based; AlphaTab's display.startBar is 1-based.
          startBar: sec.startBar + 1,
          barCount,
        }),
      });
    }
    await refreshTrackedTabSections();
  }, [compositionId, refreshTrackedTabSections, title]);

  useEffect(() => { setTempoInput(String(tempo)); }, [tempo]);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionBar, setNewSectionBar] = useState(0);

  const activeTrack = tracks[activeTrackIndex];
  const tuningPresets = activeTrack && activeTrack.instrument !== 'drums'
    ? getTuningsForInstrument(activeTrack.instrument, activeTrack.stringCount)
    : [];

  return (
    <div className="w-64 border-r border-outline-variant/20 bg-surface-container-low flex flex-col h-full overflow-hidden">
      {/* One scroll area for the whole sidebar, so nothing can ever be taller
          than its container with no way to reach it. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Song metadata — always visible, it is the identity of the tab. */}
      <div className="p-4 border-b border-outline-variant/20 space-y-2">
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
          placeholder="Song Title"
          readOnly={readOnly}
          className={cn(
            'w-full bg-transparent text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 outline-none border-b border-transparent transition-colors',
            readOnly ? 'cursor-default' : 'focus:border-primary',
          )}
        />
        <input
          value={artist}
          onChange={e => onArtistChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
          placeholder="Artist"
          readOnly={readOnly}
          className={cn(
            'w-full bg-transparent text-xs text-on-surface-variant placeholder:text-on-surface-variant/40 outline-none border-b border-transparent transition-colors',
            readOnly ? 'cursor-default' : 'focus:border-primary',
          )}
        />
        {compositionId != null && (
          <SongLearningPanel
            target={{kind: 'composition', compositionId, title: title || 'Untitled', artist: artist || undefined}}
          />
        )}
        {/* The song's real tempo. This is written into the file — the practice
            speed control in the toolbar is the one that is not. */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">BPM:</label>
          <input
            type="number"
            value={tempoInput}
            onChange={e => setTempoInput(e.target.value)}
            disabled={readOnly}
            onBlur={() => {
              const v = parseInt(tempoInput, 10);
              if (v > 0 && v <= MAX_TEMPO_BPM) onTempoChange(v);
              else setTempoInput(String(tempo));
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = parseInt(tempoInput, 10);
                if (v > 0 && v <= MAX_TEMPO_BPM) onTempoChange(v);
                else setTempoInput(String(tempo));
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setTempoInput(String(tempo));
                e.currentTarget.blur();
              }
            }}
            min={20}
            max={MAX_TEMPO_BPM}
            className="w-16 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <span className="text-[10px] text-on-surface-variant/50 leading-tight">
            the song&apos;s tempo — saved
          </span>
        </div>
        <p className="text-[10px] text-on-surface-variant/50 leading-relaxed">
          To practise slower use <span className="font-semibold">Speed</span> in the
          toolbar. That only changes playback and is never saved.
        </p>
      </div>

      {/* Stems */}
      <SidebarSection
        icon={AudioLines}
        title="Stems"
        open={openSections.stems}
        onToggle={() => toggleSection('stems')}
      >
        <StemMixerPanel {...stemPlayer} compact />
      </SidebarSection>

      {/* Tracks */}
      <SidebarSection
        icon={ListMusic}
        title="Tracks"
        open={openSections.tracks}
        onToggle={() => toggleSection('tracks')}
        badge={
          <span className="text-[10px] font-normal normal-case tracking-normal text-on-surface-variant/50 mr-1">
            {tracks.length}
          </span>
        }
        headerExtra={!readOnly && (
          <button
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Add Track"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      >
        <div className="pb-2">
        {showAddTrack && !readOnly && (
          <div className="mx-4 mb-2 p-2 bg-surface-container rounded-lg space-y-1">
            <button
              onClick={() => { onAddTrack('guitar', 6); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Guitar (6-string)
            </button>
            <button
              onClick={() => { onAddTrack('guitar', 7); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Guitar (7-string)
            </button>
            <button
              onClick={() => { onAddTrack('bass', 4); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Bass (4-string)
            </button>
            <button
              onClick={() => { onAddTrack('bass', 5); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Bass (5-string)
            </button>
            <button
              onClick={() => { onAddTrack('drums', 0); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Drum className="h-3 w-3" /> Drums
            </button>
          </div>
        )}

        <div className="space-y-0.5 px-2">
          {tracks.map((track, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                i === activeTrackIndex
                  ? 'bg-primary/10 text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
              onClick={() => onTrackSelect(i)}
            >
              {track.instrument === 'drums' ? (
                <Drum className="h-4 w-4 shrink-0" />
              ) : (
                <Guitar className="h-4 w-4 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{track.name}</div>
                <div className="text-[10px] text-on-surface-variant/60 truncate">
                  {track.instrument === 'drums' ? 'Percussion' : track.tuningName}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onToggleMute(i);
                  }}
                  className={cn(
                    'p-1 rounded transition-colors',
                    mutedTracks.has(i) ? 'text-error opacity-100' : 'text-on-surface-variant hover:bg-surface-container-high',
                  )}
                  title={mutedTracks.has(i) ? 'Unmute Track' : 'Mute Track'}
                >
                  {mutedTracks.has(i) ? <VolumeOff className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                {tracks.length > 1 && !readOnly && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveTrack(i);
                    }}
                    className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                    title="Remove Track"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
      </SidebarSection>

      {/* Key Assistant */}
      <SidebarSection
        icon={Music2}
        title="Key"
        open={openSections.key}
        onToggle={() => toggleSection('key')}
        badge={selectedKey ? (
          <span className="text-[10px] font-normal text-primary normal-case tracking-normal mr-1">{selectedKey}</span>
        ) : undefined}
      >
            <div className="px-2 pb-2 space-y-2">
              <div className="flex items-center gap-1">
                <select
                  value={selectedKey ?? ''}
                  onChange={e => onKeyChange(e.target.value || null)}
                  disabled={readOnly}
                  className="flex-1 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">— No key —</option>
                  {KEYS.map(k => (
                    <option key={k.key} value={k.key}>{k.key} major</option>
                  ))}
                </select>
                <button
                  onClick={onOpenKeyChart}
                  className="p-1.5 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant"
                  title="View full key chart"
                >
                  <TableProperties className="h-3.5 w-3.5" />
                </button>
              </div>
              {selectedKey && (() => {
                const info = getKeyInfo(selectedKey);
                if (!info) return null;
                return (
                  <div className="grid grid-cols-7 gap-0.5">
                    {DEGREES.map((deg, i) => (
                      <div key={deg} className="flex flex-col items-center gap-0.5">
                        <span className="text-[8px] text-on-surface-variant/50 uppercase">{deg}</span>
                        <span className={cn(
                          'text-[10px] font-medium text-center leading-tight',
                          info.chords[i].endsWith('°') ? 'text-on-surface-variant/50' :
                          info.chords[i].endsWith('m') ? 'text-on-surface-variant' :
                          i === 0 ? 'text-amber-400' : 'text-on-surface',
                        )}>
                          {info.chords[i]}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
      </SidebarSection>

      {/* Reading aids: fingering + strumming pattern */}
      <SidebarSection
        icon={Hand}
        title="Reading aids"
        open={openSections.readingAids}
        onToggle={() => toggleSection('readingAids')}
      >
            <div className="px-2 pb-3 space-y-1">
              <button
                onClick={onToggleFingering}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                  showFingering
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high',
                )}
                title="Alt+F"
              >
                <Hand className="h-3 w-3" />
                <span className="flex-1 text-left">{showFingering ? 'Fingering shown' : 'Fingering hidden'}</span>
                <span className="text-[10px] text-on-surface-variant/50">Alt+F</span>
              </button>
              <button
                onClick={onToggleStrumming}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                  showStrumming
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high',
                )}
                title="Show the strumming pattern of each run of bars (Alt+S)"
              >
                <Guitar className="h-3 w-3" />
                <span className="flex-1 text-left">
                  {showStrumming ? 'Strumming shown' : 'Strumming hidden'}
                </span>
                <span className="text-[10px] text-on-surface-variant/50">Alt+S</span>
              </button>
              {!readOnly && (
                <>
                  <button
                    onClick={() => onAutoRightHandFingering(hasBarSelection ? 'selection' : 'track')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <Wand2 className="h-3 w-3" />
                    <span className="flex-1 text-left">
                      Add right-hand fingering{hasBarSelection ? ' (selection)' : ''}
                    </span>
                  </button>
                  <button
                    onClick={onClearTrackFingering}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <X className="h-3 w-3" />
                    <span className="flex-1 text-left">
                      Clear right-hand fingering{hasBarSelection ? ' (selection)' : ''}
                    </span>
                  </button>
                </>
              )}
              <p className="px-2 text-[10px] text-on-surface-variant/50 leading-relaxed">
                p i m a = thumb / index / middle / ring. The thumb takes the bass
                strings, i m a the top three. Set a single note with Alt+P/I/M/A,
                the left hand with Alt+1–4, clear with Alt+0.
              </p>
            </div>
      </SidebarSection>

      {/* Sections */}
      <SidebarSection
        icon={BookOpen}
        title="Sections"
        open={openSections.sections}
        onToggle={() => toggleSection('sections')}
        badge={sections.length > 0 ? (
          <span className="text-[10px] font-normal normal-case tracking-normal text-on-surface-variant/50 mr-1">
            {sections.length}
          </span>
        ) : undefined}
      >
              <div className="px-2 pb-2 space-y-1">
                {sections.length === 0 && !addSectionOpen && (
                  <p className="px-2 text-[10px] text-on-surface-variant/50 italic">No sections yet</p>
                )}
                {sections.map(sec => {
                  const isSectionTracked = trackedTabSections.has(sec.name);
                  const canTrackSection = compositionId != null;
                  return (
                  <div
                    key={sec.startBar}
                    onClick={() => onJumpToBar(sec.startBar)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer',
                      practiceRange?.startBar === sec.startBar
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high',
                    )}
                  >
                    <span className="flex-1 font-medium truncate">{sec.name}</span>
                    <span className="text-[10px] text-on-surface-variant/50 shrink-0">
                      {sec.startBar + 1}–{sec.endBar + 1}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); if (canTrackSection) void toggleTabSectionTracking(sec); }}
                      disabled={!canTrackSection}
                      className={cn(
                        'p-0.5 rounded transition-colors shrink-0',
                        !canTrackSection
                          ? 'text-on-surface-variant/20 cursor-not-allowed'
                          : isSectionTracked
                            ? 'text-emerald-500 hover:text-emerald-600'
                            : 'text-on-surface-variant/40 hover:text-on-surface',
                      )}
                      title={!canTrackSection ? 'Save tab to track' : isSectionTracked ? 'Stop tracking this section' : 'Track this section'}
                      aria-label={!canTrackSection ? 'Save tab to track' : isSectionTracked ? 'Stop tracking section' : 'Track section'}
                    >
                      {isSectionTracked ? <BookMarked className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onPracticeRange(sec.startBar, sec.endBar); }}
                      className="p-0.5 rounded hover:bg-surface-container-highest transition-colors shrink-0"
                      title="Practice this section (loop)"
                    >
                      <Play className="h-3 w-3" />
                    </button>
                    {!readOnly && (
                      <button
                        onClick={e => { e.stopPropagation(); onRemoveSection(sec.startBar); }}
                        className="p-0.5 rounded hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors shrink-0"
                        title="Remove section"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  );
                })}
                {readOnly ? null : addSectionOpen ? (
                  <div className="px-1 space-y-1">
                    <div className="flex flex-wrap gap-1 pb-0.5">
                      {['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Solo', 'Outro'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => setNewSectionName(preset)}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors',
                            newSectionName === preset
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high',
                          )}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={newSectionName}
                      onChange={e => setNewSectionName(e.target.value)}
                      placeholder="Name (e.g. Chorus)"
                      className="w-full bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newSectionName.trim()) {
                          onAddSection(newSectionBar, newSectionName.trim());
                          setNewSectionName('');
                          setAddSectionOpen(false);
                        }
                        if (e.key === 'Escape') setAddSectionOpen(false);
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-on-surface-variant">Start bar:</label>
                      <input
                        type="number"
                        value={newSectionBar + 1}
                        onChange={e => setNewSectionBar(Math.max(0, Math.min(totalBars - 1, Number(e.target.value) - 1)))}
                        onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                        min={1}
                        max={totalBars}
                        className="w-16 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          if (newSectionName.trim()) {
                            onAddSection(newSectionBar, newSectionName.trim());
                            setNewSectionName('');
                            setAddSectionOpen(false);
                          }
                        }}
                        disabled={!newSectionName.trim()}
                        className="flex-1 text-[10px] px-2 py-1 rounded bg-primary text-on-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddSectionOpen(false); setNewSectionName(''); }}
                        className="text-[10px] px-2 py-1 rounded text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddSectionOpen(true)}
                    className="w-full flex items-center gap-1 px-2 py-1 text-[10px] text-on-surface-variant hover:bg-surface-container-high rounded transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add section
                  </button>
                )}
              </div>
      </SidebarSection>

      {/* Detected Patterns */}
      <SidebarSection
        icon={Layers}
        title="Patterns"
        open={openSections.patterns}
        onToggle={() => toggleSection('patterns')}
        badge={detectedPatterns.filter(p => !p.unique).length > 0 ? (
          <span className="text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded-full normal-case tracking-normal font-normal mr-1">
            {detectedPatterns.filter(p => !p.unique).length}
          </span>
        ) : undefined}
        headerExtra={detectedPatterns.filter(p => !p.unique).length > 0 && (
          <button
            onClick={onTogglePatternColors}
            className={cn(
              'p-0.5 rounded transition-colors',
              showPatternColors
                ? 'text-primary bg-primary/10'
                : 'text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container-high',
            )}
            title={showPatternColors ? 'Hide pattern colors' : 'Show pattern colors'}
          >
            <Palette className="h-3 w-3" />
          </button>
        )}
      >
              <div className="px-2 pb-2 space-y-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={onDetectPatterns}
                    className="flex-1 flex items-center gap-1 px-2 py-1 text-[10px] text-on-surface-variant hover:bg-surface-container-high rounded transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Detect
                  </button>
                  {detectedPatterns.length > 0 && (
                    <button
                      onClick={onTogglePatternColors}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors',
                        showPatternColors
                          ? 'bg-primary/10 text-primary'
                          : 'text-on-surface-variant hover:bg-surface-container-high',
                      )}
                      title="Toggle bar color overlays"
                    >
                      <Palette className="h-3 w-3" />
                      Colors
                    </button>
                  )}
                </div>
                {detectedPatterns.length > 0 && (() => {
                  const repeating = detectedPatterns.filter(p => !p.unique);
                  const coveredBarSet = new Set<number>();
                  for (const p of repeating) {
                    for (const start of p.instances) {
                      for (let b = start; b < start + p.barLength; b++) coveredBarSet.add(b);
                    }
                  }
                  const pct = totalBars > 0 ? Math.round((coveredBarSet.size / totalBars) * 100) : 0;
                  const uniqueCount = detectedPatterns.filter(p => p.unique).length;
                  return (
                    <div className="px-2 text-[10px] text-on-surface-variant/60 flex items-center gap-1.5">
                      <span>{repeating.length} repeating</span>
                      <span>·</span>
                      <span>{pct}% coverage</span>
                      {uniqueCount > 0 && <><span>·</span><span>{uniqueCount} unique</span></>}
                    </div>
                  );
                })()}
                {detectedPatterns.length === 0 && (
                  <p className="px-2 text-[10px] text-on-surface-variant/50 italic">
                    Click "Detect" to find repeating bars
                  </p>
                )}
                {detectedPatterns.map((pattern, idx) => {
                  const patternColor = pattern.unique ? '#6b7280' : PATTERN_COLORS[idx % PATTERN_COLORS.length];
                  const isTracked = trackedPatterns.has(pattern.label);
                  const canTrack = compositionId != null && !pattern.unique;
                  return (
                  <div key={pattern.label} className="rounded-lg overflow-hidden">
                    <div className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-container-high transition-colors">
                      <button
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        onClick={() => setExpandedPattern(expandedPattern === pattern.label ? null : pattern.label)}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{background: patternColor}}
                        />
                        {pattern.unique ? (
                          <>
                            <span className="font-medium text-on-surface-variant/70">{pattern.label}</span>
                            <span className="text-[10px] text-on-surface-variant/40">
                              {pattern.barLength > 1 ? `${pattern.barLength} bars` : '1 bar'} · unique
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium">Pattern {pattern.label}</span>
                            {pattern.barLength > 1 && (
                              <span className="text-[10px] text-on-surface-variant/40">{pattern.barLength}b</span>
                            )}
                            <span className="text-[10px] text-on-surface-variant/60">×{pattern.instances.length}</span>
                          </>
                        )}
                      </button>
                      {!pattern.unique && (
                        <button
                          onClick={e => { e.stopPropagation(); if (canTrack) void togglePatternTracking(pattern); }}
                          disabled={!canTrack}
                          className={cn(
                            'p-0.5 rounded shrink-0 transition-colors',
                            !canTrack
                              ? 'text-on-surface-variant/20 cursor-not-allowed'
                              : isTracked
                                ? 'text-emerald-500 hover:text-emerald-600'
                                : 'text-on-surface-variant/40 hover:text-on-surface',
                          )}
                          title={!canTrack ? 'Save tab to track' : isTracked ? 'Stop tracking this pattern' : 'Track this pattern'}
                          aria-label={!canTrack ? 'Save tab to track' : isTracked ? 'Stop tracking pattern' : 'Track pattern'}
                        >
                          {isTracked ? <BookMarked className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        className="p-0.5 shrink-0"
                        onClick={() => setExpandedPattern(expandedPattern === pattern.label ? null : pattern.label)}
                        aria-label={expandedPattern === pattern.label ? 'Collapse pattern' : 'Expand pattern'}
                      >
                        {expandedPattern === pattern.label
                          ? <ChevronDown className="h-3 w-3 text-on-surface-variant/60" />
                          : <ChevronRight className="h-3 w-3 text-on-surface-variant/60" />}
                      </button>
                    </div>
                    {expandedPattern === pattern.label && (
                      <div className="pl-4 pr-2 pb-1 space-y-0.5">
                        {pattern.instances.map(barIdx => (
                          <div
                            key={barIdx}
                            onClick={() => onJumpToBar(barIdx)}
                            className="flex items-center gap-1 text-[10px] text-on-surface-variant cursor-pointer rounded px-0.5 hover:bg-surface-container-high transition-colors"
                          >
                            <span className="flex-1">
                              {pattern.barLength > 1
                                ? `Bars ${barIdx + 1}–${barIdx + pattern.barLength}`
                                : `Bar ${barIdx + 1}`}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); onPracticeRange(barIdx, barIdx + pattern.barLength - 1); }}
                              className="p-0.5 rounded hover:bg-surface-container-highest transition-colors"
                              title="Practice this instance"
                            >
                              <Play className="h-3 w-3" />
                            </button>
                            {!readOnly && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const name = pattern.unique ? `${pattern.label}` : `Pattern ${pattern.label}`;
                                  setNewSectionName(name);
                                  setNewSectionBar(barIdx);
                                  setAddSectionOpen(true);
                                  if (!openSections.sections) toggleSection('sections');
                                }}
                                className="p-0.5 rounded hover:bg-surface-container-highest transition-colors"
                                title="Add as section"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
      </SidebarSection>

      {/* Tuning config for active track */}
      {activeTrack && activeTrack.instrument !== 'drums' && (
        <SidebarSection
          icon={Settings2}
          title="Tuning"
          open={openSections.tuning}
          onToggle={() => toggleSection('tuning')}
          badge={
            <span className="text-[10px] font-normal normal-case tracking-normal text-on-surface-variant/50 mr-1 truncate max-w-[88px]">
              {activeTrack.tuningName}
            </span>
          }
        >
          <div className="px-4 pb-3">
            <select
              value={activeTrack.tuningName}
              disabled={readOnly}
              onChange={e => {
                const preset = tuningPresets.find(t => t.name === e.target.value);
                if (preset) onTuningChange(activeTrackIndex, preset.values);
              }}
              className="w-full bg-surface-container text-xs text-on-surface px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {!tuningPresets.some(t => t.name === activeTrack.tuningName) && (
                <option value={activeTrack.tuningName}>{activeTrack.tuningName}</option>
              )}
              {tuningPresets.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </SidebarSection>
      )}
      </div>
    </div>
  );
}
