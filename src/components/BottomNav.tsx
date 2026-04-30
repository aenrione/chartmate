import {Link, useLocation} from 'react-router-dom';
import {cn} from '@/lib/utils';
import {NAV_TABS, isNavTabActive} from '@/lib/nav-tabs';

export default function BottomNav() {
  const {pathname} = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 bg-surface-container border-t border-outline-variant/20 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="flex h-14">
        {NAV_TABS.map(({label, icon: Icon, href, prefixes}) => {
          const active = isNavTabActive(pathname, prefixes);
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
