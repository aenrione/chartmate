import {createContext, useContext} from 'react';

export type SyncPhase =
  | 'idle'
  | 'checking'
  | 'pushing'
  | 'pulling'
  | 'syncing-pdfs'
  | 'conflict'
  | 'error';

export type ConflictInfo = {
  localChangedAt: string | null;
  remoteExportedAt: string;
  remoteDeviceId: string;
};

export type SyncState = {
  phase: SyncPhase;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  remoteExportedAt: string | null;
  remoteDeviceId: string | null;
  conflictInfo: ConflictInfo | null;
  error: string | null;
};

export type SyncStateActions = {
  setPhase: (phase: SyncPhase) => void;
  setError: (error: string | null) => void;
  setConflictInfo: (info: ConflictInfo | null) => void;
  setRemoteInfo: (exportedAt: string, deviceId: string) => void;
  setLastPushedAt: (at: string) => void;
  setLastPulledAt: (at: string) => void;
};

export const defaultSyncState: SyncState = {
  phase: 'idle',
  lastPushedAt: null,
  lastPulledAt: null,
  remoteExportedAt: null,
  remoteDeviceId: null,
  conflictInfo: null,
  error: null,
};

export const SyncStateContext = createContext<SyncState & SyncStateActions>({
  ...defaultSyncState,
  setPhase: () => {},
  setError: () => {},
  setConflictInfo: () => {},
  setRemoteInfo: () => {},
  setLastPushedAt: () => {},
  setLastPulledAt: () => {},
});

export function useSyncState() {
  return useContext(SyncStateContext);
}
