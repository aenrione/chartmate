/**
 * Puts built chart folders where the user asked for them: loose folders under
 * a directory they pick, or one .zip.
 *
 * The only platform-aware file in src/lib/chart-export — everything else is
 * plain data so the CLI can share it.
 */

import {open as openDialog, save as saveDialog} from '@tauri-apps/plugin-dialog';
import {mkdir, writeFile} from '@tauri-apps/plugin-fs';
import {join} from '@tauri-apps/api/path';
import {
  zipChartFolders,
  type ChartFolder,
} from './chartFolder';

export type DeliveryMode = 'folders' | 'zip';

export interface DeliveryResult {
  mode: DeliveryMode;
  path: string;
  folders: number;
}

/**
 * Tauri only lets the app write inside the paths listed in the fs scope of
 * src-tauri/capabilities/default.json. A folder outside it fails with a flat
 * "forbidden path" that says nothing about which folder or why.
 */
function describeWriteFailure(directory: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Outside the Tauri shell (a plain browser tab) the plugin bridge is absent
  // and every call dies on `invoke`. Say that rather than leaking the stack.
  if (/reading 'invoke'|__TAURI/i.test(message)) {
    return 'Saving files needs the desktop app — this is running in a browser.';
  }
  if (/forbidden path|not allowed|scope/i.test(message)) {
    return `Chartmate is not allowed to write to ${directory}. Pick a folder under your home directory, or add this location to the app's file scope.`;
  }
  return message;
}

/** Opens a file picker, turning a missing Tauri bridge into a readable error. */
async function pick<T>(open: () => Promise<T>): Promise<T> {
  try {
    return await open();
  } catch (error) {
    throw new Error(describeWriteFailure('', error));
  }
}

/** Returns null when the user cancels the picker. */
export async function deliverChartFolders(
  folders: ChartFolder[],
  mode: DeliveryMode,
  defaultFileName = 'chartmate-charts.zip',
): Promise<DeliveryResult | null> {
  if (folders.length === 0) throw new Error('Nothing to export');

  if (mode === 'zip') {
    const path = await pick(() =>
      saveDialog({
        defaultPath: defaultFileName,
        filters: [{name: 'Zip archive', extensions: ['zip']}],
      }),
    );
    if (!path) return null;
    try {
      await writeFile(path, zipChartFolders(folders));
    } catch (error) {
      throw new Error(describeWriteFailure(path, error));
    }
    return {mode, path, folders: folders.length};
  }

  const directory = await pick(() =>
    openDialog({
      directory: true,
      multiple: false,
      title: 'Choose where to put the charts',
    }),
  );
  if (!directory || typeof directory !== 'string') return null;

  const used = new Map<string, number>();
  for (const folder of folders) {
    // Mirrors zipChartFolders: two lessons can share a title, and neither
    // should quietly overwrite the other.
    const seen = used.get(folder.name) ?? 0;
    used.set(folder.name, seen + 1);
    const name = seen === 0 ? folder.name : `${folder.name} (${seen + 1})`;

    const target = await join(directory, name);
    try {
      await mkdir(target, {recursive: true});
      for (const file of folder.files) {
        await writeFile(await join(target, file.name), file.data);
      }
    } catch (error) {
      throw new Error(describeWriteFailure(directory, error));
    }
  }

  return {mode, path: directory, folders: folders.length};
}
