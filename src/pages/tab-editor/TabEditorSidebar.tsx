import {useCallback, useEffect, useState} from 'react';
import {cn} from '@/lib/utils';
import {
  Plus, Trash2, Guitar, Drum, Volume2, VolumeOff,
  RefreshCw, Play, ChevronDown, ChevronRight, X,
  BookOpen, Layers, Palette, Music2, TableProperties,
  Bookmark, BookMarked,
} from 'lucide-react';
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
}: TabEditorSidebarProps) {
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [keyOpen, setKeyOpen] = useState(true);
  const [sectionsOpen, setSectionsOpen] = useState(true);
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
  const [patternsOpen, setPatternsOpen] = useState(false);
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
      {/* Song metadata */}
      <div className="p-4 border-b border-outline-variant/20 space-y-2">
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
          placeholder="Song Title"
          className="w-full bg-transparent text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 outline-none border-b border-transparent focus:border-primary transition-colors"
        />
        <input
          value={artist}
          onChange={e => onArtistChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
          placeholder="Artist"
          className="w-full bg-transparent text-xs text-on-surface-variant placeholder:text-on-surface-variant/40 outline-none border-b border-transparent focus:border-primary transition-colors"
        />
        {compositionId != null && (
          <SongLearningPanel
            target={{kind: 'composition', compositionId, title: title || 'Untitled', artist: artist || undefined}}
          />
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">BPM:</label>
          <input
            type="number"
            value={tempoInput}
            onChange={e => setTempoInput(e.target.value)}
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
            className="w-16 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Stems */}
      <div className="border-b border-outline-variant/20">
        <StemMixerPanel {...stemPlayer} compact />
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tracks</span>
          <button
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Add Track"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {showAddTrack && (
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
                {tracks.length > 1 && (
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

        {/* Key Assistant */}
        <div className="border-t border-outline-variant/20">
          <button
            className="w-full flex items-center gap-2 px-4 py-2 font-bold text-on-surface-variant uppercase tracking-wider hover:bg-surface-container-high transition-colors"
            onClick={() => setKeyOpen(v => !v)}
          >
            <Music2 className="h-3 w-3" />
            <span className="flex-1 text-left text-xs">Key</span>
            {selectedKey && (
              <span className="text-[10px] font-normal text-primary normal-case tracking-normal mr-1">{selectedKey}</span>
            )}
            {keyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {keyOpen && (
            <div className="px-2 pb-2 space-y-2">
              <div className="flex items-center gap-1">
                <select
                  value={selectedKey ?? ''}
                  onChange={e => onKeyChange(e.target.value || null)}
                  className="flex-1 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
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
          )}
        </div>

        {/* Sections & Patterns */}
        <div className="border-t border-outline-variant/20">
          {/* Sections sub-section */}
          <div>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 font-bold text-on-surface-variant uppercase tracking-wider hover:bg-surface-container-high transition-colors"
              onClick={() => setSectionsOpen(v => !v)}
            >
              <BookOpen className="h-3 w-3" />
              <span className="flex-1 text-left text-xs">Sections</span>
              {sectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {sectionsOpen && (
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
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveSection(sec.startBar); }}
                      className="p-0.5 rounded hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors shrink-0"
                      title="Remove section"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  );
                })}
                {addSectionOpen ? (
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
            )}
          </div>

          {/* Detected Patterns sub-section */}
          <div>
            <div
              className="w-full flex items-center gap-2 px-4 py-2 font-bold text-on-surface-variant uppercase tracking-wider hover:bg-surface-container-high transition-colors"
              onClick={() => setPatternsOpen(v => !v)}
            >
              <Layers className="h-3 w-3" />
              <span className="flex-1 text-left text-xs">Patterns</span>
              {detectedPatterns.filter(p => !p.unique).length > 0 && (
                <span className="text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded-full">
                  {detectedPatterns.filter(p => !p.unique).length}
                </span>
              )}
              {detectedPatterns.filter(p => !p.unique).length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); onTogglePatternColors(); }}
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
              {patternsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </div>
            {patternsOpen && (
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
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const name = pattern.unique ? `${pattern.label}` : `Pattern ${pattern.label}`;
                                setNewSectionName(name);
                                setNewSectionBar(barIdx);
                                setAddSectionOpen(true);
                                setSectionsOpen(true);
                              }}
                              className="p-0.5 rounded hover:bg-surface-container-highest transition-colors"
                              title="Add as section"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tuning config for active track */}
      {activeTrack && activeTrack.instrument !== 'drums' && (
        <div className="p-4 border-t border-outline-variant/20">
          <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            Tuning
          </div>
          <select
            value={activeTrack.tuningName}
            onChange={e => {
              const preset = tuningPresets.find(t => t.name === e.target.value);
              if (preset) onTuningChange(activeTrackIndex, preset.values);
            }}
            className="w-full bg-surface-container text-xs text-on-surface px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-primary"
          >
            {tuningPresets.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
