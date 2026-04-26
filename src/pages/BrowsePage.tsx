import {useState} from 'react';
import {cn} from '@/lib/utils';
import {useMobilePageTitle} from '@/contexts/LayoutContext';
import BrowseCharts from '@/components/BrowseCharts';
import SpotifyLibraryExplorer from '@/components/SpotifyLibraryExplorer';
import CompareChartsToLocal from '@/components/CompareChartsToLocal';
import TabsBrowseTab from '@/components/TabsBrowseTab';
import {testSameCharter} from '@/lib/chartSelection/comparisonTests';
import {isMobileDevice} from '@/lib/platform';

type Tab = 'charts' | 'spotify' | 'updates' | 'guitar-tabs';

const ALL_TABS: {key: Tab; label: string; mobileHidden?: boolean}[] = [
  {key: 'charts', label: 'Rhythm Charts'},
  {key: 'spotify', label: 'Spotify Explorer', mobileHidden: true},
  {key: 'updates', label: 'Updates', mobileHidden: true},
  {key: 'guitar-tabs', label: 'Guitar Tabs'},
];

const TABS = isMobileDevice ? ALL_TABS.filter(t => !t.mobileHidden) : ALL_TABS;

const RANKING_GROUPS = [[testSameCharter]];

let _cachedTab: Tab = 'charts';

export default function BrowsePage() {
  useMobilePageTitle('Browse');
  const [activeTab, setActiveTab] = useState<Tab>(_cachedTab);

  function handleTabChange(tab: Tab) {
    _cachedTab = tab;
    setActiveTab(tab);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 py-8 max-lg:landscape:py-2 space-y-6 max-lg:landscape:space-y-2 shrink-0">
        <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight hidden lg:block">
          Browse
        </h1>
        <div className="overflow-x-auto no-scrollbar">
        <div className="bg-surface-container-low p-1.5 rounded-2xl w-fit min-w-max">
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  'px-4 py-2 max-lg:landscape:py-1.5 rounded-xl text-sm transition-colors',
                  activeTab === tab.key
                    ? 'bg-surface-container-high text-primary font-bold'
                    : 'text-on-surface-variant/50 hover:text-on-surface',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className={cn('flex-1 min-h-0 h-full overflow-hidden', activeTab !== 'charts' && 'hidden')}>
          <BrowseCharts />
        </div>
        <div className={cn('flex-1 min-h-0 h-full overflow-hidden', activeTab !== 'spotify' && 'hidden')}>
          <SpotifyLibraryExplorer />
        </div>
        <div className={cn('flex-1 overflow-y-auto p-6 h-full', activeTab !== 'updates' && 'hidden')}>
          <CompareChartsToLocal rankingGroups={RANKING_GROUPS} exact={true} />
        </div>
        <div className={cn('flex-1 min-h-0 h-full', activeTab !== 'guitar-tabs' && 'hidden')}>
          <TabsBrowseTab />
        </div>
      </div>
    </div>
  );
}
