import BrowseCharts from '@/components/BrowseCharts';

export default function BrowsePage() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 pt-4 pb-2">
        <h1 className="text-2xl font-bold">Browse & Download Charts</h1>
      </div>
      <div className="flex-1 min-h-0">
        <BrowseCharts />
      </div>
    </div>
  );
}
