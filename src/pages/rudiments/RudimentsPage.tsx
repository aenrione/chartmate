import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  rudiments,
  categories,
  categoryLabels,
  type Rudiment,
} from './rudimentData';

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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 py-6">
        {/* Hero */}
        <div className="text-center mb-10 py-12 px-6 bg-gradient-to-br from-primary/5 to-purple-500/5 rounded-2xl border border-primary/10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Drum <span className="text-primary">Rudiments</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            40 PAS International Drum Rudiments — master the fundamentals
          </p>

          <div className="flex justify-center mt-5">
            <input
              type="text"
              placeholder="Search rudiments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-80 px-4 py-2.5 rounded-xl border bg-background text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-center gap-1.5 mt-3.5 flex-wrap">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeCategory === 'all'
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              }`}>
              All 40
            </button>
            {categories.map(cat => {
              const count = rudiments.filter(r => r.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === cat
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}>
                  {categoryLabels[cat]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories */}
        {categories.map(cat => {
          const items = grouped.get(cat)!;
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-10">
              <div className="flex items-baseline gap-3 mb-4 pb-2 border-b">
                <h2 className="text-lg font-semibold tracking-tight">{categoryLabels[cat]}</h2>
                <span className="text-xs text-muted-foreground">{items.length} rudiments</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {items.map(r => (
                  <Link
                    key={r.id}
                    to={`/rudiments/${r.id}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-border/50 bg-card/50 hover:bg-primary/5 hover:border-primary/25 transition-all group">
                    <span className="text-xs font-bold text-muted-foreground min-w-[1.5rem] text-right tabular-nums">
                      {r.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.name}</div>
                      <div className="text-xs font-mono text-muted-foreground tracking-wider">{r.sticking}</div>
                    </div>
                    <span className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No rudiments match your search.
          </div>
        )}
      </div>
    </div>
  );
}
