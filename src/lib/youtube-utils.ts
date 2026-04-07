// YouTube supported playback rates
export const YOUTUBE_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function snapToYouTubeRate(rate: number): number {
  let closest = YOUTUBE_RATES[0];
  let minDiff = Math.abs(rate - closest);
  for (const ytRate of YOUTUBE_RATES) {
    const diff = Math.abs(rate - ytRate);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ytRate;
    }
  }
  return closest;
}

/**
 * Extract YouTube video ID from various URL formats.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Just the video ID itself
 */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct video ID (11 chars, alphanumeric + dash + underscore)
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
    if (
      url.hostname === 'www.youtube.com' ||
      url.hostname === 'youtube.com' ||
      url.hostname === 'm.youtube.com'
    ) {
      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/')[2] || null;
      }
      return url.searchParams.get('v') || null;
    }
  } catch {
    // Not a valid URL
  }

  return null;
}
