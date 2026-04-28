// src/components/SongProgressPanel.tsx
//
// Renders a song's per-section mastery breakdown. Reads from the existing
// song_sections + section_progress tables (no new schema). Used in:
//  - SongView (sheet music) — collapsible side panel
//  - PlaybookPage — the at-a-glance mastery view
//  - ProfilePage — top-N "songs you're learning" widget renders rows from this data
//
// Status order: not_started → practicing → needs_work → nailed_it. We display the *best* status
// per section across every setlist the chart appears in (see playbook.ts:getSongMasteryByMd5).

import {useCallback, useEffect, useState} from 'react';
import {ChevronDown, ChevronUp, Check, Circle, AlertCircle, Music, BookMarked, Bookmark} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {ProgressStatus} from '@/lib/local-db/playbook';
import {getSongMasteryByMd5, type SongMasteryView} from '@/lib/local-db/playbook';
import {createItem, deleteItem, findItemBySection} from '@/lib/local-db/repertoire';

interface Props {
  chartMd5: string;
  /** Whether the panel starts collapsed. Defaults to true so the calling surface stays compact. */
  defaultCollapsed?: boolean;
  /** Optional title override (e.g. "This song's progress"). */
  title?: string;
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'Not started',
  practicing: 'Practicing',
  needs_work: 'Needs work',
  nailed_it: 'Nailed it',
};

const STATUS_STYLE: Record<ProgressStatus, {icon: React.ComponentType<{className?: string}>; tone: string}> = {
  not_started: {icon: Circle, tone: 'text-on-surface-variant/50'},
  practicing: {icon: Circle, tone: 'text-primary'},
  needs_work: {icon: AlertCircle, tone: 'text-amber-500'},
  nailed_it: {icon: Check, tone: 'text-emerald-500'},
};

export default function SongProgressPanel({chartMd5, defaultCollapsed = true, title}: Props) {
  const [mastery, setMastery] = useState<SongMasteryView | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  /** Section ids that have a repertoire_items row attached. Reloaded on toggle. */
  const [trackedSections, setTrackedSections] = useState<Set<number>>(new Set());

  const refreshTracked = useCallback(async (sectionIds: number[]) => {
    const tracked = new Set<number>();
    await Promise.all(sectionIds.map(async id => {
      const found = await findItemBySection(id);
      if (found) tracked.add(id);
    }));
    setTrackedSections(tracked);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await getSongMasteryByMd5(chartMd5);
        if (cancelled) return;
        setMastery(m);
        await refreshTracked(m.sections.map(s => s.section.id));
      } catch {
        // tables not yet migrated — render the empty state below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartMd5, refreshTracked]);

  const toggleSectionTracking = useCallback(async (sectionId: number, sectionName: string) => {
    const existing = await findItemBySection(sectionId);
    if (existing) {
      await deleteItem(existing.id);
    } else {
      await createItem({itemType: 'song_section', title: sectionName, songSectionId: sectionId});
    }
    if (mastery) await refreshTracked(mastery.sections.map(s => s.section.id));
  }, [mastery, refreshTracked]);

  if (!mastery || mastery.totalSections === 0) return null;

  const pct = mastery.totalSections > 0
    ? Math.round((mastery.nailedSections / mastery.totalSections) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container/40">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container/70 transition-colors rounded-xl"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Music className="h-4 w-4 text-on-surface-variant shrink-0" />
          <div className="text-left min-w-0">
            <div className="text-sm font-semibold text-on-surface truncate">
              {title ?? 'Section mastery'}
            </div>
            <div className="text-xs text-on-surface-variant">
              {mastery.nailedSections} of {mastery.totalSections} nailed · {pct}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-primary')}
              style={{width: `${pct}%`}}
            />
          </div>
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-on-surface-variant" />
            : <ChevronUp className="h-4 w-4 text-on-surface-variant" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 pt-1 flex flex-col gap-1.5">
          {mastery.sections.map(({section, status, updatedAt}) => {
            const {icon: Icon, tone} = STATUS_STYLE[status];
            const isTracked = trackedSections.has(section.id);
            return (
              <div
                key={section.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-container/60 transition-colors group"
              >
                <Icon className={cn('h-4 w-4 shrink-0', tone)} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-on-surface truncate">{section.name}</div>
                  <div className="text-[10px] text-on-surface-variant/80">
                    {STATUS_LABEL[status]}
                    {updatedAt && ` · ${formatRelative(updatedAt)}`}
                    {isTracked && ' · tracked'}
                  </div>
                </div>
                <button
                  onClick={() => toggleSectionTracking(section.id, section.name)}
                  className={cn(
                    'p-1 rounded-md shrink-0 transition-colors',
                    isTracked
                      ? 'text-emerald-500 hover:text-emerald-600'
                      : 'text-on-surface-variant/40 opacity-0 group-hover:opacity-100 hover:text-on-surface',
                  )}
                  title={isTracked ? 'Stop tracking this section' : 'Track this section'}
                  aria-label={isTracked ? 'Stop tracking section' : 'Track section'}
                >
                  {isTracked ? <BookMarked className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}
