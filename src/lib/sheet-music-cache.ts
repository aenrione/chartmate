import { appCacheDir } from '@tauri-apps/api/path';
import { createChartStorage } from './chart-storage';

const storage = createChartStorage({ getBaseDir: appCacheDir, subdir: 'sheet_music' });

export const getCachedChartDir = storage.getChartDir;
export const isChartCached = storage.isStored;
export const fetchAndCacheChart = storage.fetchAndStore;
export const readCachedFile = storage.readFile;
export const listCachedFiles = storage.listFiles;
export const deleteCachedChart = storage.deleteChart;
