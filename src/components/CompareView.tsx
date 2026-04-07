import {SongIniData} from '@/lib/local-songs-folder/scanLocalCharts';
import {useCallback} from 'react';
import {downloadSong} from '@/lib/local-songs-folder';
import {Button} from '@/components/ui/button';
import {TableDownloadStates} from './SongsTable';

// Song ini keys in order for display
const songIniOrder = [
  'name',
  'artist',
  'album',
  'genre',
  'year',
  'charter',
  'song_length',
  'diff_band',
  'diff_guitar',
  'diff_guitar_coop',
  'diff_rhythm',
  'diff_bass',
  'diff_drums',
  'diff_drums_real',
  'diff_keys',
  'diff_guitarghl',
  'diff_guitar_coop_ghl',
  'diff_rhythm_ghl',
  'diff_bassghl',
  'preview_start_time',
] as const;

type NullableSongIniData = {
  [P in keyof SongIniData]: SongIniData[P] | null;
};

export default function CompareView<
  T extends NullableSongIniData,
  U extends NullableSongIniData,
>({
  id,
  currentChart,
  currentModified,
  recommendedChart,
  recommendedModified,
  parentDirectoryPath,
  currentChartFileName: _currentChartFileName,
  recommendedChartUrl,
  close,
  updateDownloadState,
}: {
  id: number;
  currentChart: T;
  currentModified: Date;
  recommendedChart: U;
  recommendedModified: Date;
  parentDirectoryPath: string;
  currentChartFileName: string;
  recommendedChartUrl: string;
  close: () => void;
  updateDownloadState: (id: string, state: TableDownloadStates) => void;
}) {
  const keepCurrentCallback = useCallback(async () => {
    close();
  }, [close]);

  const replaceCallback = useCallback(async () => {
    const {artist, name, charter} = recommendedChart;
    if (artist == null || name == null || charter == null) {
      throw new Error('Artist, name, or charter is null in song.ini');
    }

    updateDownloadState(id.toString(), 'downloading');
    try {
      close();
      await downloadSong(artist, name, charter, recommendedChartUrl, {
        folderPath: parentDirectoryPath,
        asSng: true,
      });
      updateDownloadState(id.toString(), 'downloaded');
    } catch {
      updateDownloadState(id.toString(), 'failed');
    }
  }, [
    recommendedChart,
    parentDirectoryPath,
    updateDownloadState,
    id,
    close,
    recommendedChartUrl,
  ]);

  const downloadKeepBothCallback = useCallback(async () => {
    const {artist, name, charter} = recommendedChart;

    if (currentChart.charter == charter) {
      throw new Error(
        'Cannot download both charts if they have the same charter',
      );
    }

    if (artist == null || name == null || charter == null) {
      throw new Error('Artist, name, or charter is null in song.ini');
    }

    updateDownloadState(id.toString(), 'downloading');
    close();
    await downloadSong(artist, name, charter, recommendedChartUrl, {
      asSng: true,
    });
    updateDownloadState(id.toString(), 'downloaded');
  }, [
    currentChart.charter,
    id,
    recommendedChart,
    recommendedChartUrl,
    updateDownloadState,
    close,
  ]);

  return (
    <div className="bg-surface-container-low overflow-y-auto">
      <div className="px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
        <table>
          <thead>
            <tr>
              <th className="pt-8 font-medium p-4 pl-8 pt-0 pb-3 text-on-surface-variant text-left">
                Key
              </th>
              <th className="pt-8 font-medium p-4 pl-8 pt-0 pb-3 text-on-surface-variant text-left">
                Current Chart&apos;s Value
              </th>
              <th className="pt-8 font-medium p-4 pl-8 pt-0 pb-3 text-on-surface-variant text-left">
                New Chart&apos;s Value
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                Last Modified
              </td>
              <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                {currentModified.toISOString()}
              </td>
              <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                {recommendedModified.toISOString()}
              </td>
            </tr>
            {songIniOrder
              .slice(0, songIniOrder.indexOf('preview_start_time'))
              .map(key => {
                // @ts-ignore Need to fix the types of the chart data
                const currentValue = currentChart[key];
                // @ts-ignore Need to fix the types of the chart data
                const recommendedValue = recommendedChart[key];

                if (currentValue == null && recommendedValue == null) {
                  return;
                }

                if (
                  key.startsWith('diff_') &&
                  (currentValue == -1 || currentValue == null) &&
                  (recommendedValue == -1 || recommendedValue == null)
                ) {
                  return;
                }

                return (
                  <tr key={key}>
                    <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                      {key}
                    </td>
                    <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                      {currentValue === true
                        ? 'True'
                        : currentValue === false
                          ? 'False'
                          : (currentValue ?? '')}
                    </td>
                    <td className="border-b border-white/5 p-1 pl-8 text-on-surface-variant text-left">
                      {recommendedValue === true
                        ? 'True'
                        : recommendedValue === false
                          ? 'False'
                          : (recommendedValue ?? '')}
                    </td>
                  </tr>
                );
              })
              .filter(Boolean)}
          </tbody>
        </table>
      </div>
      <div className="bg-surface-container-low px-4 py-3 flex sm:px-6 space-x-4">
        <Button onClick={keepCurrentCallback}>Keep current chart</Button>

        <Button onClick={replaceCallback}>Replace current chart</Button>

        <Button
          onClick={downloadKeepBothCallback}
          disabled={currentChart.charter == recommendedChart.charter}>
          Download and keep both
        </Button>
      </div>
    </div>
  );
}
