export function removeStyleTags(value: string) {
  return value.replace(/<[^>]+>/g, '').trim();
}

export function calculateTimeRemaining(
  startTime: Date,
  totalItems: number,
  completedItems: number,
  minProgressForEstimate = 1,
) {
  if (totalItems <= 0 || completedItems < minProgressForEstimate) {
    return 0;
  }

  const elapsedMs = Date.now() - startTime.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }

  const itemsPerMs = completedItems / elapsedMs;
  if (itemsPerMs <= 0) {
    return 0;
  }

  const remainingItems = Math.max(totalItems - completedItems, 0);
  return Math.ceil(remainingItems / itemsPerMs);
}

export function formatDuration(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimeRemaining(timeRemainingMs: number) {
  const totalSeconds = Math.max(Math.ceil(timeRemainingMs / 1000), 0);

  if (totalSeconds < 60) {
    return `${totalSeconds}s remaining`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `${minutes}m remaining`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m remaining` : `${hours}h remaining`;
}
