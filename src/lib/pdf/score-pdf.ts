/**
 * Guitar Pro score → PDF, in the WebView.
 *
 * AlphaTab's low-level `ScoreRenderer` lays a score out without a visible widget,
 * so this works for any composition in the library whether or not the editor is
 * open. It emits one SVG partial per system, which `svgPartialsToPdf` paginates.
 */
import {rendering, Settings, LayoutMode, StaveProfile, type model} from '@coderline/alphatab';
import {svgPartialsToPdf, type PdfExportOptions, type PdfExportResult} from './svg-to-pdf';

export type ScorePdfOptions = PdfExportOptions & {
  /** Tracks to render. Defaults to the first track. */
  trackIndexes?: number[];
  /** Layout width in SVG px; the result is scaled to the page. */
  width?: number;
  /** Match the on-screen profile — percussion charts render as Score, not tab. */
  staveProfile?: StaveProfile;
  fontDirectory?: string;
};

/**
 * Renders a score to SVG partials with no DOM attachment.
 *
 * `partialLayoutFinished` only reports ids — `renderResult(id)` has to be called
 * for each one or `partialRenderFinished` never fires and the result is empty.
 */
export function renderScoreToSvgPartials(
  score: model.Score,
  options: ScorePdfOptions = {},
): string[] {
  const {trackIndexes = [0], width = 1072, fontDirectory = '/font/', staveProfile} = options;

  const settings = new Settings();
  settings.core.engine = 'svg';
  settings.core.fontDirectory = fontDirectory;
  settings.core.useWorkers = false;
  settings.display.layoutMode = LayoutMode.Page;
  settings.display.scale = 1;
  if (staveProfile !== undefined) settings.display.staveProfile = staveProfile;

  const renderer = new rendering.ScoreRenderer(settings);
  renderer.width = width;

  const ids: string[] = [];
  const partials: string[] = [];
  let failure: Error | null = null;

  renderer.partialLayoutFinished.on(e => ids.push(e.id));
  renderer.partialRenderFinished.on(e => partials.push(String(e.renderResult)));
  renderer.error.on(e => { failure = e instanceof Error ? e : new Error(String(e)); });

  renderer.renderScore(score, trackIndexes);
  for (const id of ids) renderer.renderResult(id);

  if (failure) throw failure;
  return partials;
}

export async function exportScoreToPdf(
  score: model.Score,
  options: ScorePdfOptions = {},
): Promise<PdfExportResult> {
  const partials = renderScoreToSvgPartials(score, options);
  return svgPartialsToPdf(partials, {title: score.title || undefined, ...options});
}

/** `Artist - Title.pdf`, with characters that are illegal in filenames removed. */
export function scorePdfFilename(score: model.Score): string {
  const title = score.title?.trim() || 'Untitled';
  const artist = score.artist?.trim();
  return `${artist ? `${artist} - ${title}` : title}.pdf`.replace(/[/\\?%*:|"<>]/g, '_');
}
