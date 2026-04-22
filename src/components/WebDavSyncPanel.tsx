import {useState, useEffect, useCallback} from 'react';
import {Cloud, RefreshCw, Upload, Download, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight} from 'lucide-react';
import {storeGet, storeSet, storeDelete, STORE_KEYS} from '@/lib/store';
import {
  testWebDavConnection,
  saveWebDavCredentials,
  clearWebDavCredentials,
  getRemoteManifest,
  detectConflict,
  pushSync,
  pullSync,
  computePdfDiff,
  pushPdf,
  pullPdf,
  type SyncManifest,
  type PdfDiffResult,
} from '@/lib/webdav-sync';
import {getSyncMeta} from '@/lib/local-db/sync-export';
import {getLocalDb} from '@/lib/local-db/client';

type ConnectionStatus = 'unknown' | 'testing' | 'connected' | 'error';
type SyncOp = 'idle' | 'pushing' | 'pulling' | 'syncing-pdfs' | 'detecting';

type ConflictInfo = {
  localChangedAt: string | null;
  remoteExportedAt: string;
  remoteDeviceId: string;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function WebDavSyncPanel() {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('unknown');
  const [serverName, setServerName] = useState<string | null>(null);
  const [connError, setConnError] = useState<string | null>(null);

  const [syncOp, setSyncOp] = useState<SyncOp>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastPushedAt, setLastPushedAt] = useState<string | null>(null);
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null);
  const [remoteManifest, setRemoteManifest] = useState<SyncManifest | null>(null);
  const [fullSync, setFullSync] = useState(false);

  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [pendingAction, setPendingAction] = useState<'push' | 'pull' | null>(null);

  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  const [pdfDiff, setPdfDiff] = useState<PdfDiffResult | null>(null);
  const [pdfSyncProgress, setPdfSyncProgress] = useState<string | null>(null);

  // Load saved credentials + sync meta on mount
  useEffect(() => {
    async function load() {
      const savedUrl = await storeGet<string>(STORE_KEYS.WEBDAV_URL);
      const savedUser = await storeGet<string>(STORE_KEYS.WEBDAV_USERNAME);
      const savedPass = await storeGet<string>(STORE_KEYS.WEBDAV_PASSWORD);
      if (savedUrl) { setUrl(savedUrl); setConnStatus('connected'); }
      if (savedUser) setUsername(savedUser);
      if (savedPass) setPassword(savedPass);

      const meta = await getSyncMeta();
      setLastPushedAt(meta.last_pushed_at ?? null);
      setLastPulledAt(meta.last_pulled_at ?? null);
    }
    load();
  }, []);

  // Fetch remote manifest when connected
  const refreshRemote = useCallback(async () => {
    try {
      const manifest = await getRemoteManifest();
      setRemoteManifest(manifest);
    } catch {
      // Non-fatal — just means no remote data yet
    }
  }, []);

  useEffect(() => {
    if (connStatus === 'connected') refreshRemote();
  }, [connStatus, refreshRemote]);

  const handleTestConnection = async () => {
    setConnStatus('testing');
    setConnError(null);
    try {
      const name = await testWebDavConnection(url.trim(), username, password);
      await saveWebDavCredentials(url.trim(), username, password);
      setServerName(name);
      setConnStatus('connected');
      refreshRemote();
    } catch (err) {
      setConnError(err instanceof Error ? err.message : String(err));
      setConnStatus('error');
    }
  };

  const handleDisconnect = async () => {
    await clearWebDavCredentials();
    setConnStatus('unknown');
    setServerName(null);
    setRemoteManifest(null);
  };

  const handlePush = async (skipConflictCheck = false) => {
    setSyncError(null);
    try {
      if (!skipConflictCheck) {
        setSyncOp('detecting');
        const detection = await detectConflict({fullSync});
        if (detection === 'no-change') {
          setSyncOp('idle');
          return;
        }
        if (detection === 'safe-pull') {
          setSyncError('Remote has newer data. Pull first, or force push to overwrite remote.');
          setSyncOp('idle');
          return;
        }
        if (detection === 'conflict') {
          const remote = await getRemoteManifest();
          const meta = await getSyncMeta();
          setConflictInfo({
            localChangedAt: meta.last_pushed_at ?? null,
            remoteExportedAt: remote?.exported_at ?? '?',
            remoteDeviceId: remote?.device_id ?? '?',
          });
          setPendingAction('push');
          setSyncOp('idle');
          return;
        }
      }
      setSyncOp('pushing');
      await pushSync({fullSync});
      const meta = await getSyncMeta();
      setLastPushedAt(meta.last_pushed_at ?? null);
      await refreshRemote();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncOp('idle');
    }
  };

  const handlePull = async (skipConflictCheck = false) => {
    setSyncError(null);
    try {
      if (!skipConflictCheck) {
        setSyncOp('detecting');
        const detection = await detectConflict({fullSync});
        if (detection === 'no-change' || detection === 'safe-push') {
          setSyncOp('idle');
          if (detection === 'safe-push') setSyncError('No new data on server.');
          return;
        }
        if (detection === 'conflict') {
          const remote = await getRemoteManifest();
          const meta = await getSyncMeta();
          setConflictInfo({
            localChangedAt: meta.last_pushed_at ?? null,
            remoteExportedAt: remote?.exported_at ?? '?',
            remoteDeviceId: remote?.device_id ?? '?',
          });
          setPendingAction('pull');
          setSyncOp('idle');
          return;
        }
      }
      setSyncOp('pulling');
      await pullSync();
      const meta = await getSyncMeta();
      setLastPulledAt(meta.last_pulled_at ?? null);
      await refreshRemote();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncOp('idle');
    }
  };

  const handleConflictResolve = async (action: 'push' | 'pull') => {
    setConflictInfo(null);
    setPendingAction(null);
    if (action === 'push') await handlePush(true);
    else await handlePull(true);
  };

  const handleOpenPdfPanel = async () => {
    setPdfPanelOpen(v => !v);
    if (!pdfPanelOpen) {
      try {
        const db = await getLocalDb();
        const localPdfs = await db.selectFrom('pdf_library').selectAll().execute();
        const diff = await computePdfDiff(localPdfs);
        setPdfDiff(diff);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleSyncPdfs = async () => {
    if (!pdfDiff) return;
    setSyncOp('syncing-pdfs');
    setSyncError(null);
    try {
      const total = pdfDiff.toUpload.length + pdfDiff.toDownload.length;
      let done = 0;

      for (const {absPath, entry} of pdfDiff.toUpload) {
        setPdfSyncProgress(`Uploading ${++done}/${total}: ${entry.filename}`);
        await pushPdf(entry.relative_path, absPath);
      }

      const {appDataDir, join} = await import('@tauri-apps/api/path');
      const dataDir = await appDataDir();
      for (const remote of pdfDiff.toDownload) {
        setPdfSyncProgress(`Downloading ${++done}/${total}: ${remote.relative_path}`);
        const dest = await join(dataDir, remote.relative_path);
        await pullPdf(remote.relative_path, dest);
      }

      const db = await getLocalDb();
      const localPdfs = await db.selectFrom('pdf_library').selectAll().execute();
      setPdfDiff(await computePdfDiff(localPdfs));
      setPdfSyncProgress(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncOp('idle');
      setPdfSyncProgress(null);
    }
  };

  const busy = syncOp !== 'idle';

  return (
    <section>
      <div className="mb-6">
        <h3 className="text-lg font-bold font-headline text-primary mb-1 flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Cloud Sync (WebDAV)
        </h3>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Sync your charts, progress, and PDFs with a WebDAV server (Nextcloud, iCloud, Synology&hellip;)
        </p>
      </div>

      {/* Server config */}
      <div className="space-y-3 mb-5">
        <input
          type="url"
          placeholder="Server URL (e.g. https://cloud.example.com/remote.php/dav/files/user/)"
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={connStatus === 'connected'}
          className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={connStatus === 'connected'}
            autoComplete="username"
            className="px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
          />
          <input
            type="password"
            placeholder="Password / App token"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={connStatus === 'connected'}
            autoComplete="current-password"
            className="px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-3">
          {connStatus !== 'connected' ? (
            <button
              onClick={handleTestConnection}
              disabled={!url.trim() || connStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-all active:scale-95 disabled:opacity-40"
            >
              {connStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Test Connection
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-semibold hover:bg-error/10 transition-all active:scale-95"
            >
              Disconnect
            </button>
          )}

          {connStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-sm text-secondary font-medium">
              <CheckCircle className="h-4 w-4" />
              {serverName ?? 'Connected'}
            </span>
          )}
          {connStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-error">
              <XCircle className="h-4 w-4" />
              {connError}
            </span>
          )}
        </div>
      </div>

      {/* Sync status + actions */}
      {connStatus === 'connected' && (
        <>
          <div className="rounded-lg bg-surface-container/50 p-4 mb-4 space-y-1 text-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Last pushed</span>
              <span className="font-mono text-xs text-on-surface">{fmtDate(lastPushedAt)}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Remote data</span>
              <span className="font-mono text-xs text-on-surface">
                {remoteManifest ? fmtDate(remoteManifest.exported_at) : '—'}
              </span>
            </div>
            {remoteManifest && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Remote device</span>
                <span className="font-mono text-xs text-outline truncate max-w-[180px]">
                  {remoteManifest.device_id.slice(0, 8)}…
                </span>
              </div>
            )}
          </div>

          {syncError && (
            <p className="text-error text-sm mb-3 p-3 rounded-lg bg-error/10">{syncError}</p>
          )}

          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => handlePush()}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40"
            >
              {syncOp === 'pushing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Push to Server
            </button>
            <button
              onClick={() => handlePull()}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-all active:scale-95 disabled:opacity-40"
            >
              {syncOp === 'pulling' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Pull from Server
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none mb-5">
            <input
              type="checkbox"
              checked={fullSync}
              onChange={e => setFullSync(e.target.checked)}
              className="rounded border-outline-variant/40"
            />
            Include chart database (~5 MB extra)
          </label>

          {/* PDF sync */}
          <button
            onClick={handleOpenPdfPanel}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-outline-variant/20 hover:bg-surface-container/50 transition-colors text-sm text-on-surface"
          >
            <span className="flex items-center gap-2 font-medium">
              {pdfPanelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              PDF Files
              {pdfDiff && (
                <span className="text-xs text-outline font-normal">
                  {pdfDiff.toUpload.length} to upload · {pdfDiff.toDownload.length} to download
                </span>
              )}
            </span>
          </button>

          {pdfPanelOpen && pdfDiff && (
            <div className="mt-2 p-4 rounded-lg border border-outline-variant/15 space-y-3">
              {pdfDiff.toUpload.length === 0 && pdfDiff.toDownload.length === 0 ? (
                <p className="text-sm text-on-surface-variant">PDFs are in sync.</p>
              ) : (
                <>
                  {pdfDiff.toUpload.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-outline mb-1">
                        To Upload ({pdfDiff.toUpload.length})
                      </div>
                      <ul className="text-xs text-on-surface-variant space-y-0.5 max-h-32 overflow-y-auto">
                        {pdfDiff.toUpload.map(({entry}) => (
                          <li key={entry.id} className="truncate">{entry.relative_path}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {pdfDiff.toDownload.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-outline mb-1">
                        To Download ({pdfDiff.toDownload.length})
                      </div>
                      <ul className="text-xs text-on-surface-variant space-y-0.5 max-h-32 overflow-y-auto">
                        {pdfDiff.toDownload.map(r => (
                          <li key={r.relative_path} className="truncate">{r.relative_path}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {(pdfDiff.toUpload.length > 0 || pdfDiff.toDownload.length > 0) && (
                <button
                  onClick={handleSyncPdfs}
                  disabled={syncOp === 'syncing-pdfs'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/15 text-secondary text-sm font-semibold hover:bg-secondary/25 transition-all active:scale-95 disabled:opacity-40"
                >
                  {syncOp === 'syncing-pdfs' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {pdfSyncProgress ?? 'Syncing…'}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Sync PDFs
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Conflict modal */}
      {conflictInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h4 className="text-base font-bold text-on-surface">Sync Conflict</h4>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Both this device and another device changed data since last sync.
              Which version do you want to keep?
            </p>
            <div className="rounded-lg bg-surface-container/60 p-3 text-xs font-mono space-y-1 text-outline">
              <div>Local changed: {fmtDate(conflictInfo.localChangedAt)}</div>
              <div>Remote saved: {fmtDate(conflictInfo.remoteExportedAt)}</div>
              <div>Remote device: {conflictInfo.remoteDeviceId.slice(0, 8)}…</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleConflictResolve('push')}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                Keep Local
              </button>
              <button
                onClick={() => handleConflictResolve('pull')}
                className="flex-1 px-4 py-2 rounded-lg border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-all"
              >
                Use Remote
              </button>
              <button
                onClick={() => { setConflictInfo(null); setPendingAction(null); }}
                className="px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant text-sm font-semibold hover:bg-surface-container/50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
