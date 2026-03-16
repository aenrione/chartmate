import {parseChartFile} from '@eliwhite/scan-chart';
import {
  useEffect,
  useRef,
} from 'react';

import {setupRenderer} from '@/lib/preview/highway';
import {AudioManager} from '@/lib/preview/audioManager';
import {ChartResponseEncore} from '@/lib/chartSelection';

type ParsedChart = ReturnType<typeof parseChartFile>;

export default function CloneHeroRenderer({
  metadata,
  chart,
  track,
  audioManager,
}: {
  metadata: ChartResponseEncore;
  chart: ParsedChart;
  track: ParsedChart['trackData'][0];
  audioManager: AudioManager;
}) {
  const sizingRef = useRef<HTMLDivElement>(null!);
  const ref = useRef<HTMLDivElement>(null!);
  const rendererRef = useRef<ReturnType<typeof setupRenderer> | null>(null);

  useEffect(() => {
    const renderer = setupRenderer(
      metadata,
      chart,
      sizingRef,
      ref,
      audioManager,
    );
    rendererRef.current = renderer;
    renderer.prepTrack(track);
    renderer.startRender();
    return () => {
      renderer.destroy();
    };
  }, [metadata, audioManager, chart, track]);

  return (
    <div className="flex-1 flex flex-col justify-center bg-background rounded-lg border overflow-hidden">
      <div className="relative flex-1" ref={sizingRef}>
        <div ref={ref} className="h-full" />
      </div>
    </div>
  );
}

