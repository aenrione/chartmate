// src/lib/chart-persistent-store.ts
import { appDataDir } from '@tauri-apps/api/path';
import { createChartStorage } from './chart-storage';

const storage = createChartStorage({ getBaseDir: appDataDir, subdir: 'charts' });

export const isChartPersisted = storage.isStored;
export const fetchAndPersistChart = storage.fetchAndStore;
export const readPersistedFile = storage.readFile;
export const listPersistedFiles = storage.listFiles;
export const deletePersistedChart = storage.deleteChart;
