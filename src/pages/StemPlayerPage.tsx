import {Music2} from 'lucide-react';
import {useMobilePageTitle} from '@/contexts/LayoutContext';
import {useStemPlayer} from '@/hooks/useStemPlayer';
import {StemMixerPanel} from '@/components/StemMixerPanel';

export default function StemPlayerPage() {
  useMobilePageTitle('Stem Player');
  const stemPlayer = useStemPlayer('standalone');

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6 lg:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-on-surface mb-1 flex items-center gap-3">
          <Music2 className="h-7 w-7 text-primary" />
          Stem Player
        </h1>
        <p className="text-on-surface-variant text-sm">
          Load a folder of stems created by Demucs and mix tracks independently.
        </p>
      </div>

      {/* How-to hint — only show when nothing is linked/loading/copying */}
      {!stemPlayer.isLinked && !stemPlayer.isLoading && !stemPlayer.isCopying && (
        <div className="mb-6 rounded-xl border border-outline-variant/30 bg-surface-container p-4 text-sm text-on-surface-variant space-y-1">
          <p className="font-medium text-on-surface">How to create stems</p>
          <p>Run in your terminal:</p>
          <code className="block bg-surface-container-high rounded px-3 py-2 font-mono text-xs text-on-surface mt-1">
            demucs /path/to/song.mp3
          </code>
          <p className="text-xs pt-1">
            Then pick the output folder:{' '}
            <span className="font-mono text-xs">separated/htdemucs/song_name/</span>
          </p>
        </div>
      )}

      {/* Mixer panel handles everything else */}
      <StemMixerPanel {...stemPlayer} />
    </div>
  );
}
