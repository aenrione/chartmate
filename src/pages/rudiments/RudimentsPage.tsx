import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  rudiments,
  categories,
  categoryLabels,
  type Rudiment,
} from './rudimentData';

const filterPills: { value: Rudiment['category'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'rolls', label: 'Rolls' },
  { value: 'diddles', label: 'Diddles' },
  { value: 'flams', label: 'Flams' },
  { value: 'drags', label: 'Drags' },
];

export default function RudimentsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Rudiment['category'] | 'all'>('all');

  const filtered = useMemo(() => {
    let result = rudiments;
    if (activeCategory !== 'all') {
      result = result.filter(r => r.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q));
    }
    return result;
  }, [search, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<Rudiment['category'], Rudiment[]>();
    for (const cat of categories) {
      map.set(cat, []);
    }
    for (const r of filtered) {
      map.get(r.category)!.push(r);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6 md:p-12">
      {/* Header */}
      <div className="mb-10">
        <span className="font-mono text-xs uppercase tracking-widest text-tertiary mb-2 block">
          Drums
        </span>
        <h1 className="font-headline text-4xl md:text-5xl font-bold text-on-surface mb-3">
          Rudiments Library
        </h1>
        <p className="text-on-surface-variant text-lg max-w-xl">
          The 40 PAS International Drum Rudiments — master the fundamental
          building blocks of percussion technique.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          placeholder="Search rudiments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-[10px] bg-surface-container-high text-on-surface text-sm font-mono placeholder:text-on-surface-variant/50 outline-none ring-1 ring-transparent focus:ring-tertiary/40 transition-shadow"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-10">
        {filterPills.map(pill => {
          const isActive = activeCategory === pill.value;
          return (
            <button
              key={pill.value}
              onClick={() => setActiveCategory(pill.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Rudiment cards by category */}
      {categories.map(cat => {
        const items = grouped.get(cat)!;
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mb-10">
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-lg font-headline font-semibold text-on-surface">
                {categoryLabels[cat]}
              </h2>
              <span className="text-xs text-on-surface-variant">
                {items.length} rudiment{items.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(r => (
                <Link
                  key={r.id}
                  to={`/rudiments/${r.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-[10px] bg-surface-container-low hover:bg-surface-container transition-colors group"
                >
                  <span className="font-mono text-xs font-bold text-on-surface-variant min-w-[1.75rem] text-right tabular-nums">
                    {String(r.id).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-on-surface truncate">
                      {r.name}
                    </div>
                    <div className="font-mono text-xs text-on-surface-variant tracking-wider truncate">
                      {r.sticking}
                    </div>
                  </div>
                  <span className="text-on-surface-variant group-hover:text-tertiary group-hover:translate-x-0.5 transition-all text-lg">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant">
          No rudiments match your search.
        </div>
      )}
    </div>
  );
}
