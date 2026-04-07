import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { fills, getAllTags, type FillEntry } from './fillsData';
import { getAllFillStats, type FillStats } from '@/lib/local-db/fill-trainer';

const difficultyBadgeClass: Record<FillEntry['difficulty'], string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function FillsPage() {
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [fillStats, setFillStats] = useState<Map<string, FillStats> | null>(null);

  useEffect(() => {
    getAllFillStats()
      .then(stats => setFillStats(stats))
      .catch(() => {
        // gracefully ignore — cards render without stats
      });
  }, []);

  const allTags = useMemo(() => getAllTags(), []);

  const filtered = useMemo(() => {
    let result = fills;

    if (activeTags.size > 0) {
      result = result.filter(f => f.tags.some(t => activeTags.has(t)));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        f =>
          f.name.toLowerCase().includes(q) ||
          f.artist.toLowerCase().includes(q) ||
          f.song.toLowerCase().includes(q),
      );
    }

    return result;
  }, [search, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6 md:p-12">
      {/* Header */}
      <div className="mb-10">
        <span className="font-mono text-xs uppercase tracking-widest text-tertiary mb-2 block">
          Drums
        </span>
        <h1 className="font-headline text-4xl md:text-5xl font-bold text-on-surface mb-3">
          Fill Trainer
        </h1>
        <p className="text-on-surface-variant text-lg max-w-xl">
          Famous drum fills from legendary drummers — practice at your own tempo.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          placeholder="Search fills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-[10px] bg-surface-container-high text-on-surface text-sm font-mono placeholder:text-on-surface-variant/50 outline-none ring-1 ring-transparent focus:ring-tertiary/40 transition-shadow"
        />
      </div>

      {/* Tag filter pills */}
      <div className="flex gap-2 flex-wrap mb-10">
        {/* "All" pill */}
        <button
          onClick={() => setActiveTags(new Set())}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeTags.size === 0
              ? 'bg-tertiary-container text-on-tertiary-container'
              : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
          }`}
        >
          All
        </button>

        {allTags.map(tag => {
          const isActive = activeTags.has(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* Fill cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(fill => {
            const stats = fillStats?.get(fill.id) ?? null;
            const visibleTags = fill.tags.slice(0, 3);
            const extraTagCount = fill.tags.length - visibleTags.length;

            return (
              <Link
                key={fill.id}
                to={`/fills/${fill.id}`}
                className="flex items-center gap-4 px-4 py-3.5 rounded-[10px] bg-surface-container-low hover:bg-surface-container transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-on-surface truncate">
                      {fill.name}
                    </span>
                    {stats && (
                      <span className="shrink-0 text-xs font-mono text-tertiary">
                        {stats.learned ? '✓' : `${stats.attempts}×`}
                      </span>
                    )}
                  </div>

                  {/* Artist — Song */}
                  <div className="text-xs text-on-surface-variant truncate mb-1.5">
                    {fill.artist} — {fill.song}
                  </div>

                  {/* Badges row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Difficulty badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${difficultyBadgeClass[fill.difficulty]}`}
                    >
                      {fill.difficulty}
                    </span>

                    {/* BPM */}
                    <span className="ml-auto text-[10px] text-on-surface-variant font-mono">
                      ~{fill.bpmOriginal} BPM
                    </span>
                  </div>

                  {/* Tag pills */}
                  {fill.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {visibleTags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant"
                        >
                          {tag}
                        </span>
                      ))}
                      {extraTagCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant">
                          +{extraTagCount} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span className="shrink-0 text-on-surface-variant group-hover:text-tertiary group-hover:translate-x-0.5 transition-all text-lg">
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-on-surface-variant">
          No fills match your search or filter.
        </div>
      )}
    </div>
  );
}
