import {Home, BookOpen, Search} from 'lucide-react';
import {Link, useLocation} from 'react-router-dom';
import {cn} from '@/lib/utils';

const TABS = [
  {
    label: 'Practice',
    icon: Home,
    href: '/',
    prefixes: ['/sheet-music', '/guitar', '/rudiments', '/tab-editor', '/fills', '/'],
  },
  {
    label: 'Library',
    icon: BookOpen,
    href: '/library',
    prefixes: ['/library', '/setlists', '/playbook'],
  },
  {
    label: 'Browse',
    icon: Search,
    href: '/browse',
    prefixes: ['/browse', '/spotify', '/updates'],
  },
] as const;

function isTabActive(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(p => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
}

export default function BottomNav() {
  const {pathname} = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 bg-surface-container border-t border-outline-variant/20 z-50"
      style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}
    >
      <div className="flex h-14">
        {TABS.map(({label, icon: Icon, href, prefixes}) => {
          const active = isTabActive(pathname, prefixes);
          return (
            <Link
              key={label}
              to={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-on-surface-variant/50',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
