import {type ReactNode, useState, useEffect, useCallback, useRef} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {useSpotifyAuth} from '@/contexts/SpotifyAuthContext';
import {cn} from '@/lib/utils';
import ProgressionPill from './ProgressionPill';
import {
  Guitar,
  Drum,
  Settings,
  HelpCircle,
  Plus,
  Moon,
  Sun,
  PenTool,
  ListMusic,
  Play,
  Pencil,
  Trash2,
  BookMarked,
  Repeat2,
} from 'lucide-react';
import {NAV_TABS, isNavTabActive} from '@/lib/nav-tabs';
import {
  getSetlists,
  createSetlist,
  deleteSetlist,
  updateSetlist,
  type Setlist,
} from '@/lib/local-db/setlists';
import {useSidebar} from '@/contexts/SidebarContext';
import {useLayout} from '@/contexts/LayoutContext';
import SettingsDialog from '@/components/SettingsDialog';
import SpotifyStatusDialog from '@/components/SpotifyStatusDialog';
import BottomNav from '@/components/BottomNav';
import {isMobileDevice} from '@/lib/platform';

const TOP_NAV_SECTIONS = [
  {label: 'Practice', prefix: ['/sheet-music', '/guitar', '/rudiments', '/tab-editor', '/fills', '/']},
  {label: 'Library', prefix: ['/library', '/library/setlists']},
  {label: 'Browse', prefix: ['/browse', '/spotify', '/updates']},
  {label: 'Learn', prefix: ['/learn']},
  {label: 'Programs', prefix: ['/programs']},
  {label: 'Calendar', prefix: ['/calendar']},
] as const;

const INSTRUMENTS = [
  {label: 'Drums', icon: Drum, href: '/sheet-music', prefix: ['/sheet-music', '/rudiments', '/fills']},
  {label: 'Guitar', icon: Guitar, href: '/guitar', prefix: ['/guitar']},
  {label: 'Tab Editor', icon: PenTool, href: '/tab-editor', prefix: ['/tab-editor']},
] as const;

function isActive(pathname: string, prefixes: readonly string[]) {
  if (prefixes.length === 0) return false;
  return prefixes.some(p => {
    if (p === '/') return pathname === '/';
    return pathname.startsWith(p);
  });
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('chartmate-theme');
    if (stored) return stored === 'dark';
    return true; // default to dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('chartmate-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = useCallback(() => setIsDark(prev => !prev), []);
  return {isDark, toggle};
}

function TopNav({pathname}: {pathname: string}) {
  const {isConnected} = useSpotifyAuth();
  const {isDark, toggle} = useDarkMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const {hideHeaderOnMobile, mobilePageTitle} = useLayout();

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener('open-settings', handler);
    return () => window.removeEventListener('open-settings', handler);
  }, []);

  return (
    <header
      className={cn('bg-surface shrink-0 z-40', hideHeaderOnMobile && 'lg:block hidden')}
      style={{
        paddingTop: 'var(--sat)',
        paddingLeft: 'var(--sal)',
        paddingRight: 'var(--sar)',
      }}
    >
    <div className="flex justify-between items-center w-full px-6 h-16">
      <Link to="/" className="text-xl font-bold tracking-tighter text-primary font-headline">
        {mobilePageTitle ? (
          <>
            <span className="lg:hidden">{mobilePageTitle}</span>
            <span className="hidden lg:inline">Chartmate</span>
          </>
        ) : 'Chartmate'}
      </Link>

      <nav className="hidden lg:flex items-center gap-8 h-full">
        {TOP_NAV_SECTIONS.map(section => {
          const active = isActive(pathname, section.prefix);
          return (
            <Link
              key={section.label}
              to={
                section.label === 'Practice' ? '/'
                : section.label === 'Library' ? '/library'
                : section.label === 'Browse' ? '/browse'
                : section.label === 'Learn' ? '/learn'
                : section.label === 'Programs' ? '/programs'
                : section.label === 'Calendar' ? '/calendar'
                : '#'
              }
              className={cn(
                'h-full flex items-center font-medium transition-colors',
                active
                  ? 'text-primary font-bold border-b-2 border-primary-container'
                  : 'text-on-surface-variant/50 hover:text-on-surface',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <ProgressionPill />
        <button
          onClick={toggle}
          className="hover:bg-surface-container transition-all duration-200 p-2 rounded-full text-on-surface-variant"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="hover:bg-surface-container transition-all duration-200 p-2 rounded-full text-on-surface-variant"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <SpotifyStatusDialog open={spotifyOpen} onOpenChange={setSpotifyOpen} />
        {!isMobileDevice && (
          <button
            onClick={() => setSpotifyOpen(true)}
            className="p-1.5 rounded-full hover:bg-surface-container transition-all duration-200"
            title={isConnected ? 'Spotify Connected' : 'Spotify Disconnected'}
          >
            <div className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-outline',
            )} />
          </button>
        )}
      </div>
    </div>
    </header>
  );
}

function SetlistsNavSection({search}: {search: string}) {
  const navigate = useNavigate();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const selectedId = search ? Number(new URLSearchParams(search).get('id')) || null : null;
  const selectedSetlist = selectedId ? setlists.find(s => s.id === selectedId) ?? null : null;

  const loadSetlists = useCallback(async () => {
    const data = await getSetlists();
    setSetlists(data);
    return data;
  }, []);

  useEffect(() => {
    loadSetlists();
    const handler = () => loadSetlists();
    window.addEventListener('setlists-updated', handler);
    return () => window.removeEventListener('setlists-updated', handler);
  }, [loadSetlists]);

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = async () => {
    const id = await createSetlist(`Setlist ${setlists.length + 1}`);
    await loadSetlists();
    navigate(`/library/setlists?id=${id}`);
    window.dispatchEvent(new CustomEvent('setlists-updated'));
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSetlist(id);
    const updated = await loadSetlists();
    if (selectedId === id) {
      const next = updated.find(s => s.id !== id);
      navigate(next ? `/library/setlists?id=${next.id}` : '/library/setlists');
    }
    window.dispatchEvent(new CustomEvent('setlists-updated'));
  };

  const commitEdit = async () => {
    if (editingId !== null && editName.trim()) {
      await updateSetlist(editingId, {name: editName.trim()});
      await loadSetlists();
      window.dispatchEvent(new CustomEvent('setlists-updated'));
    }
    setEditingId(null);
  };

  return (
    <div className="pl-10 pb-1 space-y-0.5">
      <div className="flex items-center justify-between px-3 py-0.5">
        <span className="text-xs text-outline uppercase tracking-widest">Add Setlist</span>
        <button
          onClick={handleCreate}
          className="p-0.5 rounded hover:bg-surface-container-high"
          title="New setlist"
        >
          <Plus className="h-3 w-3 text-on-surface-variant" />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {setlists.map(s => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-md text-sm transition-colors',
              selectedId === s.id
                ? 'bg-surface-container text-on-surface font-medium'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
            )}
            onClick={() => navigate(`/library/setlists?id=${s.id}`)}
          >
            {editingId === s.id ? (
              <input
                ref={editInputRef}
                className="flex-1 min-w-0 bg-surface-container border border-outline-variant/20 rounded px-1 py-0 text-sm text-on-surface outline-none"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 min-w-0 truncate">{s.name}</span>
            )}
            <span className="text-xs text-outline tabular-nums shrink-0">{s.itemCount ?? 0}</span>
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              <button
                className="p-0.5 rounded hover:bg-surface-container-high"
                onClick={e => {
                  e.stopPropagation();
                  setEditingId(s.id);
                  setEditName(s.name);
                }}
              >
                <Pencil className="h-3 w-3 text-on-surface-variant" />
              </button>
              <button
                className="p-0.5 rounded hover:bg-error/10"
                onClick={e => handleDelete(s.id, e)}
              >
                <Trash2 className="h-3 w-3 text-error" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DefaultSidebarContent({pathname, locationState, locationSearch}: {pathname: string; locationState: unknown; locationSearch: string}) {
  const state = locationState as {activeTab?: string} | null;

  return (
    <>
      <div className="px-6 mb-8">
        <div className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">
          My Studio
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {INSTRUMENTS.map(item => {
          const savedChartsActive = pathname === '/library/saved-charts' && (
            (item.href === '/guitar' && state?.activeTab === 'guitar') ||
            (item.href === '/sheet-music' && state?.activeTab === 'chorus')
          );
          const active = isActive(pathname, item.prefix) || savedChartsActive;
          const Icon = item.icon;

          const subItems =
            item.href === '/guitar'
              ? [
                  {label: 'Fretboard IQ', href: '/guitar/fretboard', prefix: '/guitar/fretboard'},
                  {label: 'Chord Finder', href: '/guitar/chords', prefix: '/guitar/chords'},
                  {label: 'EarIQ', href: '/guitar/ear', prefix: '/guitar/ear'},
                  {label: 'Saved Charts', href: '/library/saved-charts', prefix: '/library/saved-charts', state: {activeTab: 'guitar'}},
                ]
              : item.href === '/sheet-music'
              ? [
                  {label: 'Rudiments', href: '/rudiments', prefix: '/rudiments'},
                  {label: 'Fills', href: '/fills', prefix: '/fills'},
                  {label: 'Saved Charts', href: '/library/saved-charts', prefix: '/library/saved-charts', state: {activeTab: 'chorus'}},
                ]
              : [];

          return (
            <div key={item.label}>
              <Link
                to={item.href}
                className={cn(
                  'px-4 py-3 flex items-center gap-3 transition-all duration-150',
                  active
                    ? 'text-on-surface bg-surface-container'
                    : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>

              {active && subItems.length > 0 && (
                <div className="pl-10 pb-1 space-y-0.5">
                  {subItems.map(sub => (
                    <Link
                      key={sub.label}
                      to={sub.href}
                      state={'state' in sub ? sub.state : undefined}
                      className={cn(
                        'block px-3 py-1.5 rounded-md text-sm transition-all duration-150',
                        pathname.startsWith(sub.prefix)
                          ? 'text-on-surface bg-surface-container font-medium'
                          : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
                      )}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* RepertoireIQ nav item */}
        <div>
          <Link
            to="/guitar/repertoire"
            className={cn(
              'px-4 py-3 flex items-center gap-3 transition-all duration-150',
              pathname.startsWith('/guitar/repertoire')
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
            )}
          >
            <Repeat2 className="h-5 w-5" />
            <span className="font-medium">RepertoireIQ</span>
          </Link>
          {pathname.startsWith('/guitar/repertoire') && (
            <div className="pl-10 pb-1 space-y-0.5">
              {([
                {label: 'All', filter: 'all'},
                {label: 'Guitar', filter: 'guitar'},
                {label: 'Drums', filter: 'drums'},
                {label: 'Theory', filter: 'theory'},
              ] as const).map(({label, filter}) => {
                const href = `/guitar/repertoire?filter=${filter}`;
                const matchesFilter = locationSearch.includes(`filter=${filter}`) ||
                  (filter === 'all' && !locationSearch.includes('filter='));
                const active = pathname.startsWith('/guitar/repertoire') &&
                  !pathname.includes('/session') && !pathname.includes('/manage') &&
                  !pathname.includes('/progress') && matchesFilter;
                return (
                  <Link
                    key={filter}
                    to={href}
                    className={cn(
                      'block px-3 py-1.5 rounded-md text-sm transition-all duration-150',
                      active
                        ? 'text-on-surface bg-surface-container font-medium'
                        : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Saved Charts nav item */}
        <div>
          <Link
            to="/library/saved-charts"
            className={cn(
              'px-4 py-3 flex items-center gap-3 transition-all duration-150',
              pathname === '/library/saved-charts'
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
            )}
          >
            <BookMarked className="h-5 w-5" />
            <span className="font-medium">Saved Charts</span>
          </Link>
        </div>

        {/* Setlists nav item */}
        <div>
          <Link
            to="/library/setlists"
            className={cn(
              'px-4 py-3 flex items-center gap-3 transition-all duration-150',
              pathname.startsWith('/library/setlists')
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/50',
            )}
          >
            <ListMusic className="h-5 w-5" />
            <span className="font-medium">Setlists</span>
          </Link>
          {pathname.startsWith('/library/setlists') && (
            <SetlistsNavSection search={locationSearch} />
          )}
        </div>
      </nav>

      <div className="px-4 mt-auto space-y-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
          className="w-full text-on-surface-variant/60 hover:text-on-surface px-4 py-2 flex items-center gap-3 hover:bg-surface-variant/50 rounded-lg"
        >
          <Settings className="h-4 w-4" />
          <span className="font-medium text-sm">Settings</span>
        </button>
        <a
          href="#"
          className="text-on-surface-variant/60 hover:text-on-surface px-4 py-2 flex items-center gap-3 hover:bg-surface-variant/50 rounded-lg"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="font-medium text-sm">Help</span>
        </a>
      </div>
    </>
  );
}

function LandscapeRail({pathname}: {pathname: string}) {
  return (
    <nav
      className="hidden max-lg:landscape:flex flex-col items-center gap-1 pt-2 pb-2 w-14 shrink-0 bg-surface-container-low border-r border-outline-variant/20 overflow-y-auto"
      style={{paddingTop: 'max(0.5rem, var(--sat))', paddingBottom: 'max(0.5rem, var(--sab))'}}
    >
      {NAV_TABS.map(({label, icon: Icon, href, prefixes}) => {
        const active = isNavTabActive(pathname, prefixes);
        return (
          <Link
            key={label}
            to={href}
            title={label}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container',
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({pathname, locationState, locationSearch}: {pathname: string; locationState: unknown; locationSearch: string}) {
  const {sidebarContent} = useSidebar();

  return (
    <aside className={cn(
      'hidden lg:flex flex-col h-full bg-surface-container-low w-64 border-r border-outline-variant/20 shrink-0',
      !sidebarContent && 'py-4',
    )}>
      {sidebarContent ?? <DefaultSidebarContent pathname={pathname} locationState={locationState} locationSearch={locationSearch} />}
    </aside>
  );
}

export default function Layout({children}: {children: ReactNode}) {
  const location = useLocation();
  const pathname = location.pathname;
  const isPlaybook = pathname.startsWith('/playbook');
  const {hideBottomNavOnMobile} = useLayout();

  const showBottomNav = !hideBottomNavOnMobile;
  // Bottom padding accounts for nav height (hidden in landscape, so use safe area only there)
  const contentPaddingClass = showBottomNav
    ? 'pb-[var(--bottom-nav-safe-height)] max-lg:landscape:pb-[var(--sab)]'
    : 'pb-[var(--sab)]';

  if (isPlaybook) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-surface">
        <TopNav pathname={pathname} />
        <div
          className={cn('flex flex-1 min-h-0 overflow-hidden', contentPaddingClass)}
          style={{
            paddingLeft: 'var(--sal)',
            paddingRight: 'var(--sar)',
          }}
        >
          <LandscapeRail pathname={pathname} />
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
        {showBottomNav && <div className="max-lg:landscape:hidden"><BottomNav /></div>}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <TopNav pathname={pathname} />
      <div
        className={cn('flex flex-1 min-h-0 overflow-hidden', contentPaddingClass)}
        style={{
          paddingLeft: 'var(--sal)',
          paddingRight: 'var(--sar)',
        }}
      >
        <Sidebar pathname={pathname} locationState={location.state} locationSearch={location.search} />
        <LandscapeRail pathname={pathname} />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
      {showBottomNav && <div className="max-lg:landscape:hidden"><BottomNav /></div>}
    </div>
  );
}
