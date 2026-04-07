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
} from 'lucide-react';

const TOP_NAV_SECTIONS = [
  {label: 'Practice', prefix: ['/sheet-music', '/guitar', '/rudiments', '/']},
  {label: 'Library', prefix: ['/library', '/library/setlists']},
  {label: 'Browse', prefix: ['/browse', '/spotify', '/updates']},
  {label: 'Learn', prefix: []},
] as const;

const INSTRUMENTS = [
  {label: 'Drums', icon: Drum, href: '/sheet-music', prefix: ['/sheet-music', '/rudiments']},
  {label: 'Guitar', icon: Guitar, href: '/guitar', prefix: ['/guitar']},
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

  return (
    <header className="bg-surface flex justify-between items-center w-full px-6 h-16 shrink-0 z-40">
      <Link to="/" className="text-xl font-bold tracking-tighter text-primary font-headline">
        Chartmate
      </Link>

      <nav className="hidden md:flex items-center gap-8 h-full">
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
        <button className="hover:bg-surface-container transition-all duration-200 p-2 rounded-full text-on-surface-variant">
          <Settings className="h-4 w-4" />
        </button>
        <div className={cn(
          'h-2 w-2 rounded-full',
          isConnected ? 'bg-emerald-500' : 'bg-outline',
        )} title={isConnected ? 'Spotify Connected' : 'Spotify Disconnected'} />
      </div>
    </header>
  );
}

function Sidebar({pathname}: {pathname: string}) {
  return (
    <aside className="hidden md:flex flex-col h-full py-4 bg-surface-container-low w-64 border-r border-outline-variant/20 shrink-0">
      <div className="px-6 mb-8">
        <div className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">
          My Studio
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {INSTRUMENTS.map(item => {
          const active = isActive(pathname, item.prefix);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
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
        <Link
          to="/settings"
          className="text-on-surface-variant/60 hover:text-on-surface px-4 py-2 flex items-center gap-3 hover:bg-surface-variant/50 rounded-lg"
        >
          <Settings className="h-4 w-4" />
          <span className="font-medium text-sm">Settings</span>
        </Link>
        <a
          href="#"
          className="text-on-surface-variant/60 hover:text-on-surface px-4 py-2 flex items-center gap-3 hover:bg-surface-variant/50 rounded-lg"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="font-medium text-sm">Help</span>
        </a>
      </div>
    </aside>
  );
}

export default function Layout({children}: {children: ReactNode}) {
  const location = useLocation();
  const pathname = location.pathname;
  const isPlaybook = pathname.startsWith('/playbook');

  if (isPlaybook) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-surface">
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <TopNav pathname={pathname} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar pathname={pathname} />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
