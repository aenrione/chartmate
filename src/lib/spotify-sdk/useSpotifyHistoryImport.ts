/**
 * Phase 1: One-time historical JSON import.
 *
 * Exposes a `importHistoryFiles()` function that opens a file picker for
 * Streaming_History_Audio_*.json files, parses them, and bulk-upserts into
 * the local `spotify_history` table.  Already-processed files are skipped
 * (idempotent by filename + size).
 */

import {useState, useCallback} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {readTextFile} from '@tauri-apps/plugin-fs';
import {
  parseStreamingHistoryJson,
  importHistoryFromJson,
  isHistoryFileAlreadyImported,
  type StreamingHistoryEntry,
} from '@/lib/local-db/spotify-history';

export type ImportStatus =
  | {phase: 'idle'}
  | {phase: 'picking'}
  | {phase: 'importing'; current: number; total: number; filename: string}
  | {phase: 'done'; imported: number; skipped: number; totalTracks: number}
  | {phase: 'error'; message: string};

export function useSpotifyHistoryImport() {
  const [status, setStatus] = useState<ImportStatus>({phase: 'idle'});

  const importHistoryFiles = useCallback(async () => {
    setStatus({phase: 'picking'});

    let filePaths: string[] | null;
    try {
      const result = await open({
        multiple: true,
        filters: [
          {name: 'Spotify History JSON', extensions: ['json']},
        ],
        title: 'Select Spotify Streaming_History_Audio_*.json files',
      });
      // `open` returns string | string[] | null depending on `multiple`
      if (result == null) {
        setStatus({phase: 'idle'});
        return;
      }
      filePaths = Array.isArray(result) ? result : [result];
    } catch (err) {
      setStatus({phase: 'error', message: String(err)});
      return;
    }

    if (filePaths.length === 0) {
      setStatus({phase: 'idle'});
      return;
    }

    let importedFiles = 0;
    let skippedFiles = 0;
    let totalTrackCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const filename = filePath.split('/').pop() ?? filePath;

      setStatus({
        phase: 'importing',
        current: i + 1,
        total: filePaths.length,
        filename,
      });

      try {
        const text = await readTextFile(filePath);
        // File size approximation using UTF-8 byte length
        const fileSize = new TextEncoder().encode(text).length;

        const alreadyImported = await isHistoryFileAlreadyImported(filename, fileSize);
        if (alreadyImported) {
          console.log(`[HistoryImport] Skipping already-imported file: ${filename}`);
          skippedFiles++;
          continue;
        }

        const raw: StreamingHistoryEntry[] = JSON.parse(text);
        if (!Array.isArray(raw)) {
          console.warn(`[HistoryImport] ${filename} is not a JSON array – skipping`);
          skippedFiles++;
          continue;
        }

        const aggregated = parseStreamingHistoryJson(raw);
        await importHistoryFromJson(aggregated, filename, fileSize);
        importedFiles++;
        totalTrackCount += aggregated.length;
        console.log(
          `[HistoryImport] Imported ${aggregated.length} aggregated tracks from ${filename}`,
        );
      } catch (err) {
        console.error(`[HistoryImport] Error processing ${filename}:`, err);
        // Continue processing remaining files rather than aborting
        skippedFiles++;
      }
    }

    setStatus({
      phase: 'done',
      imported: importedFiles,
      skipped: skippedFiles,
      totalTracks: totalTrackCount,
    });
  }, []);

  const reset = useCallback(() => {
    setStatus({phase: 'idle'});
  }, []);

  return {status, importHistoryFiles, reset};
}
