import {type ReactNode, useState, useEffect, useCallback} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {useSpotifyAuth} from '@/contexts/SpotifyAuthContext';
import {cn} from '@/lib/utils';
import {
  Guitar,
  Drum,
  Settings,
  HelpCircle,
  Plus,
  Moon,
  Sun,
  PenTool,
} from 'lucide-react';
import {useSidebar} from '@/contexts/SidebarContext';
import {useLayout} from '@/contexts/LayoutContext';
import SettingsDialog from '@/components/SettingsDialog';
import BottomNav from '@/components/BottomNav';

const TOP_NAV_SECTIONS = [
  {label: 'Practice', prefix: ['/sheet-music', '/guitar', '/rudiments', '/tab-editor', '/fills', '/']},
  {label: 'Library', prefix: ['/library', '/library/setlists']},
  {label: 'Browse', prefix: ['/browse', '/spotify', '/updates']},
  {label: 'Learn', prefix: []},
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
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
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
                : '#'
              }
              className={cn(
                'h-full flex items-center font-medium transition-colors',
                active
                  ? 'text-primary font-bold border-b-2 border-primary-container'
                  : 'text-on-surface-variant/50 hover:text-on-surface',
                section.prefix.length === 0 && 'opacity-40 pointer-events-none',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
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
        <div className={cn(
          'h-2 w-2 rounded-full hidden lg:block',
          isConnected ? 'bg-emerald-500' : 'bg-outline',
        )} title={isConnected ? 'Spotify Connected' : 'Spotify Disconnected'} />
      </div>
    </div>
    </header>
  );
}

function DefaultSidebarContent({pathname}: {pathname: string}) {
  return (
    <>
      <div className="px-6 mb-8">
        <div className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">
          My Studio
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {INSTRUMENTS.map(item => {
          const active = isActive(pathname, item.prefix);
          const Icon = item.icon;

          const subItems =
            item.href === '/guitar'
              ? [
                  {label: 'Fretboard IQ', href: '/guitar/fretboard', prefix: '/guitar/fretboard'},
                  {label: 'Chord Finder', href: '/guitar/chords', prefix: '/guitar/chords'},
                  {label: 'EarIQ', href: '/guitar/ear', prefix: '/guitar/ear'},
                  {label: 'RepertoireIQ', href: '/guitar/repertoire', prefix: '/guitar/repertoire'},
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
      </nav>

      <div className="px-4 mt-auto space-y-1">
        <Link
          to="/"
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary-container font-bold flex items-center justify-center gap-2 mb-4 shadow-lg shadow-primary-container/20 active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" />
          New Session
        </Link>
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

function Sidebar({pathname}: {pathname: string}) {
  const {sidebarContent} = useSidebar();

  return (
    <aside className={cn(
      'hidden lg:flex flex-col h-full bg-surface-container-low w-64 border-r border-outline-variant/20 shrink-0',
      !sidebarContent && 'py-4',
    )}>
      {sidebarContent ?? <DefaultSidebarContent pathname={pathname} />}
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
    ? 'pb-[var(--bottom-nav-safe-height)] max-lg:landscape:pb-[env(safe-area-inset-bottom,0px)]'
    : 'pb-[env(safe-area-inset-bottom,0px)]';

  if (isPlaybook) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-surface">
        <TopNav pathname={pathname} />
        <main
          className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', contentPaddingClass)}
          style={{
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          {children}
        </main>
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
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <Sidebar pathname={pathname} />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
      {showBottomNav && <div className="max-lg:landscape:hidden"><BottomNav /></div>}
    </div>
  );
}
