import {invoke} from '@tauri-apps/api/core';
import {appDataDir, join} from '@tauri-apps/api/path';
import {storeGet, storeSet, storeDelete, STORE_KEYS} from './store';
import {
  exportUserTables,
  importUserTables,
  getOrCreateDeviceId,
  getSyncMeta,
  updateSyncMeta,
  type SyncMetaKeys,
} from './local-db/sync-export';
import {emitSyncEvent} from './sync-events';
import type {Selectable} from 'kysely';
import type {PdfLibrary} from './local-db/types';

// ─── Types matching Rust structs ─────────────────────────────────────────────

export type SyncManifest = {
  schema_version: number;
  exported_at: string;
  device_id: string;
  export_hash: string;
  app_version: string;
  full_sync: boolean;
};

export type RemotePdfEntry = {
  relative_path: string;
  content_length: number | null;
  last_modified: string | null;
};

export type PdfDiffResult = {
  toUpload: Array<{entry: Selectable<PdfLibrary>; absPath: string}>;
  toDownload: RemotePdfEntry[];
};

export type ConflictDetection =
  | 'safe-push'
  | 'safe-pull'
  | 'no-change'
  | 'conflict';

// ─── Credential helpers (store-only, no Rust needed) ─────────────────────────

export async function saveWebDavCredentials(
  url: string,
  username: string,
  password: string,
): Promise<void> {
  await storeSet(STORE_KEYS.WEBDAV_URL, url);
  await storeSet(STORE_KEYS.WEBDAV_USERNAME, username);
  await storeSet(STORE_KEYS.WEBDAV_PASSWORD, password);
}

export async function clearWebDavCredentials(): Promise<void> {
  await storeDelete(STORE_KEYS.WEBDAV_URL);
  await storeDelete(STORE_KEYS.WEBDAV_USERNAME);
  await storeDelete(STORE_KEYS.WEBDAV_PASSWORD);
}

export async function hasWebDavCredentials(): Promise<boolean> {
  const url = await storeGet<string>(STORE_KEYS.WEBDAV_URL);
  return !!url;
}

async function getCredentials(): Promise<{url: string; username: string; password: string}> {
  const url = await storeGet<string>(STORE_KEYS.WEBDAV_URL);
  const username = await storeGet<string>(STORE_KEYS.WEBDAV_USERNAME);
  const password = await storeGet<string>(STORE_KEYS.WEBDAV_PASSWORD);
  if (!url) throw new Error('WebDAV not configured. Add server URL in Settings.');
  return {url, username: username ?? '', password: password ?? ''};
}

// ─── Low-level command wrappers ───────────────────────────────────────────────

export async function testWebDavConnection(
  url: string,
  username: string,
  password: string,
): Promise<string> {
  return invoke<string>('webdav_test_connection', {url, username, password});
}

export async function getRemoteManifest(): Promise<SyncManifest | null> {
  const creds = await getCredentials();
  return invoke<SyncManifest | null>('webdav_get_remote_manifest', creds);
}

export async function listRemotePdfs(): Promise<RemotePdfEntry[]> {
  const creds = await getCredentials();
  return invoke<RemotePdfEntry[]>('webdav_list_remote_pdfs', creds);
}

export async function pushPdf(relativePath: string, absLocalPath: string): Promise<void> {
  const creds = await getCredentials();
  return invoke<void>('webdav_push_pdf', {...creds, relativePath, absLocalPath});
}

export async function pullPdf(relativePath: string, absLocalPath: string): Promise<void> {
  const creds = await getCredentials();
  return invoke<void>('webdav_pull_pdf', {...creds, relativePath, absLocalPath});
}

// ─── Three-way conflict detection ────────────────────────────────────────────

export async function detectConflict(opts: {fullSync?: boolean} = {}): Promise<ConflictDetection> {
  const remote = await getRemoteManifest();
  if (!remote) return 'safe-push'; // nothing on server yet

  const meta = await getSyncMeta();
  const baseHash = meta.sync_base_hash;

  if (!baseHash) {
    // Never synced from this device before — treat remote as authoritative
    return 'safe-pull';
  }

  const {hash: localHash} = await exportUserTables(opts);
  const localChanged = localHash !== baseHash;
  const remoteChanged = remote.export_hash !== baseHash;

  if (!localChanged && !remoteChanged) return 'no-change';
  if (!localChanged && remoteChanged) return 'safe-pull';
  if (localChanged && !remoteChanged) return 'safe-push';
  return 'conflict';
}

// ─── Push orchestration ───────────────────────────────────────────────────────

export type PushResult = {exportedAt: string; fullSync: boolean};

export async function pushSync(opts: {fullSync?: boolean} = {}): Promise<PushResult> {
  const creds = await getCredentials();
  const {json, hash} = await exportUserTables(opts);
  const deviceId = await getOrCreateDeviceId();
  const meta = await getSyncMeta();

  const manifest: SyncManifest = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    device_id: deviceId,
    export_hash: hash,
    app_version: '1.0.0',
    full_sync: opts.fullSync ?? false,
  };

  const newEtag = await invoke<string>('webdav_upload_export', {
    ...creds,
    jsonExport: json,
    manifestJson: JSON.stringify(manifest),
    ifMatchEtag: meta.sync_remote_etag ?? null,
  });

  await updateSyncMeta({
    last_pushed_at: manifest.exported_at,
    sync_base_hash: hash,
    sync_remote_etag: newEtag,
  } satisfies SyncMetaKeys);

  emitSyncEvent('sync:push-complete');
  return {exportedAt: manifest.exported_at, fullSync: opts.fullSync ?? false};
}

// ─── Pull orchestration ───────────────────────────────────────────────────────

export async function pullSync(): Promise<void> {
  const creds = await getCredentials();
  const json = await invoke<string>('webdav_download_export', creds);
  const remote = await getRemoteManifest();

  await importUserTables(json);

  if (remote) {
    await updateSyncMeta({
      last_pulled_at: new Date().toISOString(),
      sync_base_hash: remote.export_hash,
    });
  }

  emitSyncEvent('sync:pull-complete');
}

// ─── PDF diff ─────────────────────────────────────────────────────────────────

export async function computePdfDiff(
  localPdfs: Selectable<PdfLibrary>[],
): Promise<PdfDiffResult> {
  const remotePdfs = await listRemotePdfs();
  const dataDir = await appDataDir();

  const remoteByPath = new Map(remotePdfs.map(r => [r.relative_path, r]));
  const localByPath = new Map(localPdfs.map(p => [p.relative_path, p]));

  const toUpload: PdfDiffResult['toUpload'] = [];
  for (const entry of localPdfs) {
    const remote = remoteByPath.get(entry.relative_path);
    if (!remote || (remote.content_length != null && remote.content_length !== entry.file_size_bytes)) {
      toUpload.push({
        entry,
        absPath: await join(dataDir, entry.relative_path),
      });
    }
  }

  const toDownload: RemotePdfEntry[] = remotePdfs.filter(
    r => !localByPath.has(r.relative_path),
  );

  return {toUpload, toDownload};
}
