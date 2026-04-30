import {Home, BookOpen, GraduationCap, Calendar, Search} from 'lucide-react';

export const NAV_TABS = [
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
    label: 'Learn',
    icon: GraduationCap,
    href: '/learn',
    prefixes: ['/learn'],
  },
  {
    label: 'Calendar',
    icon: Calendar,
    href: '/calendar',
    prefixes: ['/calendar'],
  },
  {
    label: 'Browse',
    icon: Search,
    href: '/browse',
    prefixes: ['/browse', '/spotify', '/updates'],
  },
] as const;

export function isNavTabActive(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(p => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
}
