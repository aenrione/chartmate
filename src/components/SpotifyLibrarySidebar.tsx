import {useCallback, useMemo, useState} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Disc3,
  Music,
  Search,
} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SidebarPlaylist = {
  id: string;
  name: string;
  matchCount: number;
  totalTracks: number;
};

export type SidebarAlbum = {
  id: string;
  name: string;
  artistName: string;
  matchCount: number;
  totalTracks: number;
};

type Props = {
  playlists: SidebarPlaylist[];
  albums: SidebarAlbum[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const INITIAL_PLAYLISTS_SHOWN = 5;
const INITIAL_ALBUMS_SHOWN = 3;

export default function SpotifyLibrarySidebar({
  playlists,
  albums,
  selectedIds,
  onSelectionChange,
  collapsed,
  onToggleCollapse,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showMorePlaylists, setShowMorePlaylists] = useState(false);
  const [showMoreAlbums, setShowMoreAlbums] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const isAllSelected = selectedIds.size === 0;

  const toggleItem = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  const selectAll = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // Filter and sort playlists
  const filteredPlaylists = useMemo(() => {
    let items = showEmpty
      ? playlists
      : playlists.filter(p => p.matchCount > 0);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(q));
    }

    // Sort by match count desc, but pin selected items to top (non-mutating)
    return [...items].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 1 : 0;
      const bSelected = selectedIds.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return b.matchCount - a.matchCount;
    });
  }, [playlists, searchQuery, showEmpty, selectedIds]);

  // Filter and sort albums
  const filteredAlbums = useMemo(() => {
    let items = showEmpty ? albums : albums.filter(a => a.matchCount > 0);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.artistName?.toLowerCase().includes(q),
      );
    }

    return [...items].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 1 : 0;
      const bSelected = selectedIds.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return b.matchCount - a.matchCount;
    });
  }, [albums, searchQuery, showEmpty, selectedIds]);

  // Determine visible items
  const visiblePlaylists =
    searchQuery || showMorePlaylists
      ? filteredPlaylists
      : filteredPlaylists.slice(0, INITIAL_PLAYLISTS_SHOWN);
  const hiddenPlaylistCount = filteredPlaylists.length - visiblePlaylists.length;

  const visibleAlbums =
    searchQuery || showMoreAlbums
      ? filteredAlbums
      : filteredAlbums.slice(0, INITIAL_ALBUMS_SHOWN);
  const hiddenAlbumCount = filteredAlbums.length - visibleAlbums.length;

  const handleCollapse = useCallback(() => {
    setSearchQuery('');
    onToggleCollapse();
  }, [onToggleCollapse]);

  // --- COLLAPSED VIEW ---
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2 px-1.5 border-r border-border bg-card w-11 flex-shrink-0 overflow-y-auto">
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-accent text-muted-foreground flex-shrink-0"
          title="Expand sidebar">
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="h-px w-6 bg-border my-1 flex-shrink-0" />

        <TooltipProvider delayDuration={300}>
          {/* All button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={selectAll}
                className={cn(
                  'w-7 h-7 rounded flex items-center justify-center text-[10px] font-medium flex-shrink-0',
                  isAllSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}>
                All
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">All Library</TooltipContent>
          </Tooltip>

          {/* Playlist icons */}
          {visiblePlaylists.map(p => (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleItem(p.id)}
                  className={cn(
                    'w-7 h-7 rounded flex items-center justify-center flex-shrink-0',
                    selectedIds.has(p.id)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50',
                  )}>
                  <Music className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {p.name} ({p.matchCount}/{p.totalTracks})
              </TooltipContent>
            </Tooltip>
          ))}

          <div className="h-px w-6 bg-border my-1 flex-shrink-0" />

          {/* Album icons */}
          {visibleAlbums.map(a => (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleItem(a.id)}
                  className={cn(
                    'w-7 h-7 rounded flex items-center justify-center flex-shrink-0',
                    selectedIds.has(a.id)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50',
                  )}>
                  <Disc3 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {a.name} ({a.matchCount}/{a.totalTracks})
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    );
  }

  // --- EXPANDED VIEW ---
  return (
    <div className="flex flex-col border-r border-border bg-card w-[230px] flex-shrink-0 overflow-hidden transition-[width] duration-150 ease-in-out">
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Header */}
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-sm font-semibold text-foreground">Library</span>
          <button
            onClick={handleCollapse}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="Collapse sidebar">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 pl-7 text-xs"
          />
        </div>

        {/* All Library */}
        <button
          onClick={selectAll}
          className={cn(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm',
            isAllSelected
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50',
          )}>
          <div
            className={cn(
              'w-3.5 h-3.5 rounded-sm border flex items-center justify-center',
              isAllSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground',
            )}>
            {isAllSelected && <span className="text-[10px]">&#10003;</span>}
          </div>
          <span className="flex-1 text-left truncate">All Library</span>
        </button>

        {/* Playlists section */}
        {filteredPlaylists.length > 0 && (
          <>
            <div className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Playlists
            </div>
            {visiblePlaylists.map(p => (
              <SidebarRow
                key={p.id}
                name={p.name}
                matchCount={p.matchCount}
                totalTracks={p.totalTracks}
                selected={selectedIds.has(p.id)}
                dimmed={p.matchCount === 0}
                onClick={() => toggleItem(p.id)}
              />
            ))}
            {hiddenPlaylistCount > 0 && (
              <button
                onClick={() => setShowMorePlaylists(true)}
                className="px-2 py-0.5 text-xs text-primary hover:underline">
                See {hiddenPlaylistCount} more playlists
              </button>
            )}
            {showMorePlaylists &&
              !searchQuery &&
              filteredPlaylists.length > INITIAL_PLAYLISTS_SHOWN && (
                <button
                  onClick={() => setShowMorePlaylists(false)}
                  className="px-2 py-0.5 text-xs text-primary hover:underline">
                  Show less
                </button>
              )}
          </>
        )}

        {/* Albums section */}
        {filteredAlbums.length > 0 && (
          <>
            <div className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Albums
            </div>
            {visibleAlbums.map(a => (
              <SidebarRow
                key={a.id}
                name={a.name}
                matchCount={a.matchCount}
                totalTracks={a.totalTracks}
                selected={selectedIds.has(a.id)}
                dimmed={a.matchCount === 0}
                onClick={() => toggleItem(a.id)}
              />
            ))}
            {hiddenAlbumCount > 0 && (
              <button
                onClick={() => setShowMoreAlbums(true)}
                className="px-2 py-0.5 text-xs text-primary hover:underline">
                See {hiddenAlbumCount} more albums
              </button>
            )}
            {showMoreAlbums &&
              !searchQuery &&
              filteredAlbums.length > INITIAL_ALBUMS_SHOWN && (
                <button
                  onClick={() => setShowMoreAlbums(false)}
                  className="px-2 py-0.5 text-xs text-primary hover:underline">
                  Show less
                </button>
              )}
          </>
        )}
      </div>

      {/* Show empty toggle - pinned to bottom */}
      <div className="border-t border-border p-2">
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={e => setShowEmpty(e.target.checked)}
            className="rounded border-muted-foreground"
          />
          Show empty
        </label>
      </div>
    </div>
  );
}

function SidebarRow({
  name,
  matchCount,
  totalTracks,
  selected,
  dimmed,
  onClick,
}: {
  name: string;
  matchCount: number;
  totalTracks: number;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1 rounded text-xs',
        dimmed && 'opacity-50',
        selected ? 'bg-accent/70' : 'hover:bg-accent/50',
      )}>
      <div
        className={cn(
          'w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0',
          selected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground',
        )}>
        {selected && <span className="text-[10px]">&#10003;</span>}
      </div>
      <span className="flex-1 text-left truncate text-foreground">{name}</span>
      <span className="text-green-500 tabular-nums flex-shrink-0">
        {matchCount}
      </span>
      <span className="text-muted-foreground tabular-nums flex-shrink-0">
        /{totalTracks}
      </span>
    </button>
  );
}
