import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ListMusic,
  LayoutList,
  Gauge,
  Volume2,
  StickyNote,
  Plus,
  Trash2,
  Play,
  Pause,
  Repeat,
  X,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Slider} from '@/components/ui/slider';
import {cn} from '@/lib/utils';
import {usePlaybook} from './PlaybookProvider';
import type {ProgressStatus} from '@/lib/local-db/playbook';

// ── Constants ────────────────────────────────────────────────────────

const STATUS_DOT: Record<ProgressStatus, string> = {
  not_started: 'bg-outline',
  needs_work: 'bg-error',
  practicing: 'bg-tertiary',
  nailed_it: 'bg-green-400',
};

const STATUS_OPTIONS: {value: ProgressStatus; label: string}[] = [
  {value: 'not_started', label: 'Not Started'},
  {value: 'needs_work', label: 'Needs Work'},
  {value: 'practicing', label: 'Practicing'},
  {value: 'nailed_it', label: 'Nailed It'},
];

const PANELS = [
  {id: 'songs', icon: ListMusic, label: 'Songs'},
  {id: 'sections', icon: LayoutList, label: 'Sections'},
  {id: 'controls', icon: Gauge, label: 'Controls'},
  {id: 'audio', icon: Volume2, label: 'Audio'},
  {id: 'annotations', icon: StickyNote, label: 'Notes'},
] as const;

type PanelId = typeof PANELS[number]['id'];

function renderPanel(id: PanelId): React.ReactNode {
  switch (id) {
    case 'songs': return <SongNavigatorPanel />;
    case 'sections': return <SectionsPanel />;
    case 'controls': return <ControlsPanel />;
    case 'audio': return <AudioPanel />;
    case 'annotations': return <AnnotationsPanel />;
  }
}

// ── Song Navigator Panel ─────────────────────────────────────────────

function SongNavigatorPanel() {
  const {items, activeIndex, goToSong, songStatus} = usePlaybook();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono px-3 py-2">
        Song Navigator
      </div>
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => goToSong(i)}
          className={cn(
            'w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors',
            i === activeIndex
              ? 'bg-surface-container text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
        >
          <div className={cn(
            'h-2 w-2 rounded-full shrink-0',
            i === activeIndex ? STATUS_DOT[songStatus] : 'bg-outline',
          )} />
          <span className="font-mono text-xs text-outline w-5 text-right shrink-0">{i + 1}</span>
          <span className="truncate">{item.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Sections Panel ───────────────────────────────────────────────────

function SectionsPanel() {
  const {
    sections,
    sectionProgress,
    loopSectionId,
    setLoopSectionId,
    addSection,
    removeSection,
    setSectionStatus,
  } = usePlaybook();

  const [addingName, setAddingName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAdd) inputRef.current?.focus();
  }, [showAdd]);

  const getStatus = (sectionId: number): ProgressStatus => {
    const sp = sectionProgress.find(p => p.songSectionId === sectionId);
    return (sp?.status as ProgressStatus) ?? 'not_started';
  };

  const handleAddSection = async () => {
    const name = addingName.trim();
    if (!name) return;
    await addSection(name, 0, 0);
    setAddingName('');
    setShowAdd(false);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono">
          Sections
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {showAdd && (
        <div className="px-3 pb-2 flex gap-1">
          <input
            ref={inputRef}
            className="flex-1 text-xs bg-surface-container border border-outline-variant/20 rounded px-2 py-1 text-on-surface outline-none focus:ring-1 focus:ring-outline"
            placeholder="Section name..."
            value={addingName}
            onChange={e => setAddingName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddSection();
              if (e.key === 'Escape') setShowAdd(false);
            }}
          />
        </div>
      )}

      {sections.length === 0 ? (
        <div className="px-3 py-4 text-xs text-outline text-center">
          No sections defined. Add sections to track progress.
        </div>
      ) : (
        sections.map(sec => {
          const status = getStatus(sec.id);
          const isLooping = loopSectionId === sec.id;
          return (
            <div
              key={sec.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer',
                isLooping
                  ? 'bg-surface-container text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
              onClick={() => setLoopSectionId(isLooping ? null : sec.id)}
            >
              <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[status])} />
              <span className="flex-1 truncate text-xs">{sec.name}</span>
              <select
                className="text-[10px] bg-transparent border-none outline-none text-on-surface-variant cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                value={status}
                onChange={e => {
                  e.stopPropagation();
                  setSectionStatus(sec.id, e.target.value as ProgressStatus);
                }}
                onClick={e => e.stopPropagation()}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-error/10 transition-opacity"
                onClick={e => {
                  e.stopPropagation();
                  removeSection(sec.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-error" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Controls Panel ───────────────────────────────────────────────────

function ControlsPanel() {
  const {
    speed,
    setSpeed,
    isPlaying,
    togglePlay,
    loopSectionId,
    setLoopSectionId,
  } = usePlaybook();

  const [metronome, setMetronome] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono">
        Controls
      </div>

      {/* Speed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-on-surface-variant">Speed</span>
          <span className="text-xs font-mono text-on-surface tabular-nums">{speed}%</span>
        </div>
        <Slider
          value={[speed]}
          min={25}
          max={200}
          step={5}
          onValueChange={([v]) => setSpeed(v)}
        />
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant={isPlaying ? 'default' : 'outline'}
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={togglePlay}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-2">
        <Button
          variant={loopSectionId !== null ? 'default' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setLoopSectionId(loopSectionId !== null ? null : -1)}
        >
          <Repeat className="h-3 w-3 mr-1" />
          Loop
        </Button>
        <Button
          variant={metronome ? 'default' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setMetronome(!metronome)}
        >
          <Gauge className="h-3 w-3 mr-1" />
          Metro
        </Button>
      </div>
    </div>
  );
}

// ── Audio Panel ──────────────────────────────────────────────────────

function AudioPanel() {
  const [volume, setVolume] = useState(80);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono">
        Audio
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-on-surface-variant">Master Volume</span>
          <span className="text-xs font-mono text-on-surface tabular-nums">{volume}%</span>
        </div>
        <Slider
          value={[volume]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => setVolume(v)}
        />
      </div>
      <p className="text-xs text-outline text-center pt-4">
        Audio playback coming soon.
      </p>
    </div>
  );
}

// ── Annotations Panel ────────────────────────────────────────────────

function AnnotationsPanel() {
  const {sections, annotations, addAnnotation, editAnnotation, removeAnnotation} = usePlaybook();
  const [addingSectionId, setAddingSectionId] = useState<number | null>(null);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSectionId !== null) inputRef.current?.focus();
  }, [addingSectionId]);

  useEffect(() => {
    if (editingId !== null) editRef.current?.focus();
  }, [editingId]);

  const handleAdd = async () => {
    if (!newContent.trim() || addingSectionId === null) return;
    await addAnnotation(addingSectionId, newContent.trim());
    setNewContent('');
    setAddingSectionId(null);
  };

  const handleEdit = async () => {
    if (!editContent.trim() || editingId === null) return;
    await editAnnotation(editingId, editContent.trim());
    setEditingId(null);
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono mb-2">
        Annotations
      </div>

      {sections.length === 0 ? (
        <p className="text-xs text-outline text-center py-4">
          Add sections first to attach annotations.
        </p>
      ) : (
        sections.map(sec => {
          const sectionAnnotations = annotations.filter(a => a.songSectionId === sec.id);
          return (
            <div key={sec.id} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono">
                  {sec.name}
                </span>
                <button
                  className="p-0.5 rounded hover:bg-surface-container-high"
                  onClick={() => {
                    setAddingSectionId(sec.id);
                    setNewContent('');
                  }}
                >
                  <Plus className="h-3 w-3 text-on-surface-variant" />
                </button>
              </div>

              {sectionAnnotations.map(ann => (
                <div key={ann.id} className="group flex items-start gap-1 py-1">
                  {editingId === ann.id ? (
                    <input
                      ref={editRef}
                      className="flex-1 text-xs bg-surface-container border border-outline-variant/20 rounded px-2 py-1 text-on-surface outline-none focus:ring-1 focus:ring-outline"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={handleEdit}
                    />
                  ) : (
                    <>
                      <p
                        className="flex-1 text-xs text-on-surface cursor-pointer hover:text-primary"
                        onClick={() => {
                          setEditingId(ann.id);
                          setEditContent(ann.content);
                        }}
                      >
                        {ann.content}
                      </p>
                      <button
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-error/10 transition-opacity shrink-0"
                        onClick={() => removeAnnotation(ann.id)}
                      >
                        <Trash2 className="h-3 w-3 text-error" />
                      </button>
                    </>
                  )}
                </div>
              ))}

              {addingSectionId === sec.id && (
                <div className="flex gap-1 mt-1">
                  <input
                    ref={inputRef}
                    className="flex-1 text-xs bg-surface-container border border-outline-variant/20 rounded px-2 py-1 text-on-surface outline-none focus:ring-1 focus:ring-outline"
                    placeholder="Add note..."
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAdd();
                      if (e.key === 'Escape') setAddingSectionId(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────────

export default function PlaybookSidebar() {
  const {sidebarExpanded, activeItem, mobileSidebarOpen, setMobileSidebarOpen} = usePlaybook();
  const [activePanel, setActivePanel] = useState<PanelId>('songs');

  const isChart = !activeItem || activeItem.itemType === 'chart';

  const visiblePanels = useMemo(
    () => (isChart ? PANELS : PANELS.filter(p => p.id !== 'sections' && p.id !== 'annotations')),
    [isChart],
  );

  // Reset to a valid panel when the active one is hidden (e.g. after item type change).
  useEffect(() => {
    if (!visiblePanels.some(p => p.id === activePanel)) {
      setActivePanel(visiblePanels[0]?.id ?? 'songs');
    }
  }, [visiblePanels, activePanel]);

  const sidebarContent = (
    <>
      {/* Panel tabs */}
      <div className="flex border-b border-white/5 shrink-0 px-2 gap-1 py-1">
        {visiblePanels.map(panel => {
          const Icon = panel.icon;
          const isActive = activePanel === panel.id;
          return (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-surface-container text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
              )}
              title={panel.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      {/* Panel content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {renderPanel(activePanel)}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[199] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-[200] w-[280px] flex flex-col bg-surface-container-low border-r border-white/5 transition-transform duration-300 ease-in-out',
          'lg:hidden',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          paddingTop: 'var(--sat)',
          paddingBottom: 'var(--sab)',
        }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
          <span className="text-xs font-bold font-mono uppercase tracking-widest text-on-surface-variant">Setlist</span>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex shrink-0 flex-col bg-surface-container-low border-r border-white/5 transition-all duration-200',
          sidebarExpanded ? 'w-[280px]' : 'w-16',
        )}
      >
        <div className={cn(
          'flex border-b border-white/5 shrink-0',
          sidebarExpanded ? 'px-2 gap-1 py-1' : 'flex-col items-center py-1 gap-1',
        )}>
          {visiblePanels.map(panel => {
            const Icon = panel.icon;
            const isActive = activePanel === panel.id;
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-surface-container text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                )}
                title={panel.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        {sidebarExpanded && (
          <div className="flex-1 min-h-0 flex flex-col">
            {renderPanel(activePanel)}
          </div>
        )}
      </aside>
    </>
  );
}
