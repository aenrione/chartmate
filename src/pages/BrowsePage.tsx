import {useState} from 'react';
import {cn} from '@/lib/utils';
import BrowseCharts from '@/components/BrowseCharts';
import Spotify from './spotify/Spotify';
import CompareChartsToLocal from '@/components/CompareChartsToLocal';
import TabsBrowseTab from '@/components/TabsBrowseTab';
import {testSameCharter} from '@/lib/chartSelection/comparisonTests';

type Tab = 'charts' | 'spotify' | 'updates' | 'guitar-tabs';

const TABS: {key: Tab; label: string}[] = [
  {key: 'charts', label: 'Rhythm Charts'},
  {key: 'spotify', label: 'Spotify Import'},
  {key: 'updates', label: 'Updates'},
  {key: 'guitar-tabs', label: 'Guitar Tabs'},
];

const RANKING_GROUPS = [[testSameCharter]];

export default function BrowsePage() {
  const [activeTab, setActiveTab] = useState<Tab>('charts');

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 py-8 space-y-6 shrink-0">
        <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight">
          Browse
        </h1>
        <div className="bg-surface-container-low p-1.5 rounded-2xl w-fit">
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm transition-colors',
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'charts' && <BrowseCharts />}
        {activeTab === 'spotify' && (
          <div className="flex-1 overflow-y-auto p-6 h-full">
            <Spotify />
          </div>
        )}
        {activeTab === 'updates' && (
          <div className="flex-1 overflow-y-auto p-6 h-full">
            <CompareChartsToLocal rankingGroups={RANKING_GROUPS} exact={true} />
          </div>
        )}
        {activeTab === 'guitar-tabs' && <TabsBrowseTab />}
      </div>
    </div>
  );
}
