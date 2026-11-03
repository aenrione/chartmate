import {useEffect, useRef, useState} from 'react';
import {parseChartFile} from '@eliwhite/scan-chart';
import {StaveProfile, type model} from '@coderline/alphatab';
import {createGuitarDemo} from '@/lib/tab-editor/examples/guitar-demo';
import {buildChartScore} from '@/pages/sheet-music/buildChartScore';
import {exportScoreToPdf, scorePdfFilename} from '@/lib/pdf/score-pdf';
import {pdfjsLib} from '@/lib/pdf/pdfjs-init';

export type HarnessReport = {
  ok: boolean;
  error?: string;
  filename?: string;
  pageCount?: number;
  byteLength?: number;
  header?: string;
  warnings?: string[];
  /** Read back out of the produced bytes by pdf.js, not from our own state. */
  pdfjsPages?: number;
  textSample?: string[];
  /** Fraction of non-white pixels after rasterising page 1. */
  inkRatio?: number;
};

/**
 * Exports the built-in demo score to PDF, then reads the bytes back with pdf.js —
 * the same renderer the in-app PDF viewer uses — and rasterises page 1.
 */
/** A minimal Clone Hero drum chart: two bars of eighth-note snare, one section. */
function createChartScore(): {score: InstanceType<typeof model.Score>; staveProfile: StaveProfile} {
  const notes = [0, 96, 192, 288, 384, 480, 576, 672]
    .map(tick => `  ${tick} = N 1 0`).join('\n');
  const inlineChart = `[Song]
{
  Resolution = 192
}

[SyncTrack]
{
  0 = TS 4 2
  0 = B 120000
}

[Events]
{
  0 = E "section Intro"
}

[ExpertDrums]
{
${notes}
}
`;
  const chart = parseChartFile(new TextEncoder().encode(inlineChart), 'chart', {});
  const track = chart.trackData.find(t => t.instrument === 'drums');
  if (!track) throw new Error('fixture chart has no drum track');
  const score = buildChartScore(chart as never, track as never, {
    title: 'Fixture Chart',
    artist: 'Test Charter',
  });
  return {score, staveProfile: StaveProfile.Score};
}

export type HarnessProps = {
  /** 'demo' = Guitar Pro score, 'chart' = Clone Hero chart converted to notation. */
  source?: 'demo' | 'chart';
};

export function PdfExportHarness({source = 'demo'}: HarnessProps) {
  const [report, setReport] = useState<HarnessReport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const chartCase = source === 'chart' ? createChartScore() : null;
        const score = chartCase ? chartCase.score : createGuitarDemo();
        const result = await exportScoreToPdf(
          score,
          chartCase ? {staveProfile: chartCase.staveProfile} : {},
        );
        const bytes = result.bytes;

        const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
        const page = await doc.getPage(1);
        const text = await page.getTextContent();

        const viewport = page.getViewport({scale: 1});
        const canvas = canvasRef.current!;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({canvas, canvasContext: ctx, viewport}).promise;

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) ink++;
        }

        if (cancelled) return;
        setReport({
          ok: true,
          filename: scorePdfFilename(score),
          pageCount: result.pageCount,
          byteLength: bytes.length,
          header: new TextDecoder().decode(bytes.slice(0, 8)),
          warnings: result.warnings,
          pdfjsPages: doc.numPages,
          textSample: text.items.map(i => ('str' in i ? i.str : '')).filter(Boolean).slice(0, 12),
          inkRatio: ink / (canvas.width * canvas.height),
        });
      } catch (e) {
        if (!cancelled) setReport({ok: false, error: e instanceof Error ? e.message : String(e)});
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  return (
    <div>
      <canvas ref={canvasRef} data-testid="pdf-canvas" />
      {report && <pre data-testid="report">{JSON.stringify(report)}</pre>}
    </div>
  );
}
