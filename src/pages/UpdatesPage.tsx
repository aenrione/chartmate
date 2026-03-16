import CompareChartsToLocal from '@/components/CompareChartsToLocal';
import {testSameCharter} from '@/lib/chartSelection/comparisonTests';

const RANKING_GROUPS = [[testSameCharter]];

export default function UpdatesPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <CompareChartsToLocal rankingGroups={RANKING_GROUPS} exact={true} />
    </div>
  );
}
