import {useState} from 'react';
import {Plus, Trash2, ChevronDown, ChevronRight} from 'lucide-react';
import type {
  SongSection,
  SongAnnotation,
  ProgressStatus,
  SectionProgressRecord,
} from '@/lib/local-db/playbook';

type Props = {
  sections: SongSection[];
  annotations: SongAnnotation[];
  sectionProgress: SectionProgressRecord[];
  currentPage: number;
  onGoToSection: (section: SongSection) => void;
  onAddSection: (name: string, page: number, yOffset: number) => Promise<void>;
  onRemoveSection: (id: number) => Promise<void>;
  onSetSectionStatus: (id: number, status: ProgressStatus) => Promise<void>;
  onAddAnnotation: (sectionId: number, content: string) => Promise<void>;
  onRemoveAnnotation: (id: number) => Promise<void>;
};

const STATUS_COLORS: Record<ProgressStatus, string> = {
  not_started: 'text-outline',
  practicing: 'text-primary',
  needs_work: 'text-error',
  nailed_it: 'text-tertiary',
};

const STATUS_LABELS: Record<ProgressStatus, string> = {
  not_started: '○',
  practicing: '◑',
  needs_work: '✗',
  nailed_it: '✓',
};

const STATUS_CYCLE: ProgressStatus[] = ['not_started', 'practicing', 'needs_work', 'nailed_it'];

export default function PdfSectionPanel({
  sections,
  annotations,
  sectionProgress,
  currentPage,
  onGoToSection,
  onAddSection,
  onRemoveSection,
  onSetSectionStatus,
  onAddAnnotation,
  onRemoveAnnotation,
}: Props) {
  const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [annotationDraft, setAnnotationDraft] = useState<Record<number, string>>({});

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    await onAddSection(newSectionName.trim(), currentPage, 0);
    setNewSectionName('');
  };

  const getProgress = (sectionId: number): ProgressStatus =>
    (sectionProgress.find(p => p.songSectionId === sectionId)?.status as ProgressStatus) ??
    'not_started';

  const sectionAnnotations = (sectionId: number) =>
    annotations.filter(a => a.songSectionId === sectionId);

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-3 py-2 border-b border-outline-variant font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        Sections
      </div>

      <div className="flex-1 overflow-y-auto">
        {sections.map(section => {
          const progress = getProgress(section.id);
          const expanded = expandedSectionId === section.id;
          const annots = sectionAnnotations(section.id);

          return (
            <div key={section.id} className="border-b border-outline-variant/50">
              <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-variant/50">
                <button
                  onClick={() => setExpandedSectionId(expanded ? null : section.id)}
                  className="flex-shrink-0"
                >
                  {expanded
                    ? <ChevronDown className="h-3 w-3 text-outline" />
                    : <ChevronRight className="h-3 w-3 text-outline" />
                  }
                </button>

                <button
                  onClick={() => onGoToSection(section)}
                  className="flex-1 text-left text-xs truncate hover:text-primary transition-colors"
                >
                  {section.name}
                  {section.pdfPage != null && (
                    <span className="ml-1 text-outline font-mono">p.{section.pdfPage}</span>
                  )}
                </button>

                <button
                  onClick={() => {
                    const idx = STATUS_CYCLE.indexOf(progress);
                    onSetSectionStatus(section.id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
                  }}
                  className={`flex-shrink-0 text-xs font-mono w-4 ${STATUS_COLORS[progress]}`}
                  title={progress}
                >
                  {STATUS_LABELS[progress]}
                </button>

                <button
                  onClick={() => onRemoveSection(section.id)}
                  className="flex-shrink-0 p-0.5 hover:text-error transition-colors opacity-40 hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {expanded && (
                <div className="px-4 pb-2 space-y-1">
                  {annots.map(a => (
                    <div key={a.id} className="flex items-start gap-1 text-xs text-on-surface-variant">
                      <span className="flex-1">{a.content}</span>
                      <button
                        onClick={() => onRemoveAnnotation(a.id)}
                        className="flex-shrink-0 hover:text-error transition-colors opacity-40 hover:opacity-100 mt-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <input
                    value={annotationDraft[section.id] ?? ''}
                    onChange={e =>
                      setAnnotationDraft(p => ({...p, [section.id]: e.target.value}))
                    }
                    placeholder="Add note…"
                    className="w-full text-xs bg-surface-container border border-outline-variant rounded
                               px-1.5 py-0.5 focus:outline-none focus:border-primary mt-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && annotationDraft[section.id]?.trim()) {
                        onAddAnnotation(section.id, annotationDraft[section.id].trim());
                        setAnnotationDraft(p => ({...p, [section.id]: ''}));
                      }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {sections.length === 0 && (
          <p className="px-3 py-4 text-xs text-outline text-center">No sections yet</p>
        )}
      </div>

      {/* Add section */}
      <div className="px-2 py-2 border-t border-outline-variant flex gap-1">
        <input
          value={newSectionName}
          onChange={e => setNewSectionName(e.target.value)}
          placeholder={`New section (p.${currentPage})…`}
          className="flex-1 text-xs bg-surface-container border border-outline-variant rounded
                     px-1.5 py-1 focus:outline-none focus:border-primary"
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddSection();
          }}
        />
        <button
          onClick={handleAddSection}
          disabled={!newSectionName.trim()}
          className="p-1.5 rounded bg-primary text-on-primary disabled:opacity-30
                     hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
