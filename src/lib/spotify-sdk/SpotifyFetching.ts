import {useCallback, useEffect, useState} from 'react';
import {RateLimitError, getSpotifySdk} from './ClientInstance';
import {
  PlaylistedTrack,
  SimplifiedPlaylist,
  SpotifyApi,
  Track,
} from '@spotify/web-api-ts-sdk';
import pMap from 'p-map';
import {storeGet, storeSet} from '@/lib/store';

// Configurable threshold for maximum playlist size to fetch in detail
export const MAX_PLAYLIST_TRACKS_TO_FETCH = 5000;

export type TrackResult = {
  id: string;
  name: string;
  artists: string[];
  preview_url: string | null;
  spotify_url: string;
};

type CachePlaylistTracks = {
  [snapshotId: string]: TrackResult[];
};

type CacheAlbumTracks = {
  [albumId: string]: TrackResult[];
};

type PlaylistMetadata = {
  [snapshotId: string]: PlaylistItem;
};

type AlbumMetadata = {
  [albumId: string]: AlbumItem;
};

type PlaylistItem = {
  id: string;
  name: string;
  externalUrl: string;
  total: number;
  owner: {
    displayName: string;
    externalUrl: string;
  };
  collaborative: boolean;
};

type AlbumItem = {
  id: string;
  name: string;
  externalUrl?: string;
  artistName?: string;
  addedAt: string; // ISO string
  totalTracks?: number;
};

type PlaylistProgressMetadata = {
  [snapshotId: string]: PlaylistProgressItem;
};

type AlbumProgressMetadata = {
  [albumId: string]: SavedAlbumItem;
};

export type ProgressStatus = 'pending' | 'fetching' | 'done' | 'error';

export type PlaylistProgressItem = PlaylistItem & {
  fetched: number;
  status: ProgressStatus;
  lastError?: string;
};

export type RateLimitState = {retryAfterSeconds: number} | null;

export type SavedAlbumItem = AlbumItem & {
  fetched?: number;
  status?: ProgressStatus;
};

const cacheUpdateListeners: Set<() => void> = new Set();

export function onPlaylistCacheUpdated(listener: () => void): () => void {
  cacheUpdateListeners.add(listener);
  return () => {
    cacheUpdateListeners.delete(listener);
  };
}

function emitPlaylistCacheUpdated() {
  cacheUpdateListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      // ignore listener errors
    }
  });
}

async function getCachedPlaylistTracks(): Promise<CachePlaylistTracks> {
  const cachedPlaylistTracks = await storeGet<CachePlaylistTracks>('playlistTracks');
  return cachedPlaylistTracks ?? {};
}

async function setCachedPlaylistTracks(
  cachedPlaylistTracks: CachePlaylistTracks,
) {
  await storeSet('playlistTracks', cachedPlaylistTracks);
  emitPlaylistCacheUpdated();
}

async function getCachedAlbumTracks(): Promise<CacheAlbumTracks> {
  const cached = await storeGet<CacheAlbumTracks>('albumTracks');
  return cached ?? {};
}

async function setCachedAlbumTracks(cachedAlbumTracks: CacheAlbumTracks) {
  await storeSet('albumTracks', cachedAlbumTracks);
  emitPlaylistCacheUpdated();
}

async function setCachedPlaylistMetadata(
  cachedPlaylistMetadata: PlaylistMetadata,
) {
  await storeSet('playlistMetadata', cachedPlaylistMetadata);
}

async function getCachedPlaylistMetadata(): Promise<PlaylistMetadata> {
  const meta = await storeGet<PlaylistMetadata>('playlistMetadata');
  return meta ?? {};
}

async function setCachedAlbumMetadata(cachedAlbumMetadata: AlbumMetadata) {
  await storeSet('albumMetadata', cachedAlbumMetadata);
}

async function getCachedAlbumMetadata(): Promise<AlbumMetadata> {
  const meta = await storeGet<AlbumMetadata>('albumMetadata');
  return meta ?? {};
}

export async function clearSpotifyCache() {
  try {
    await Promise.all([
      setCachedPlaylistTracks({}),
      setCachedPlaylistMetadata({}),
      setCachedAlbumTracks({}),
      setCachedAlbumMetadata({}),
    ]);
    console.log('[Spotify] Cleared cache for fresh database sync');
  } catch (error) {
    console.warn('[Spotify] Failed to clear cache:', error);
  }
}

export async function getAllPlaylists(
  sdk: SpotifyApi,
): Promise<SimplifiedPlaylist[]> {
  const playlists: SimplifiedPlaylist[] = [];
  const limit = 50;
  let offset = 0;
  let total = null;
  do {
    const lists = await sdk.currentUser.playlists.playlists(limit, offset);
    if (total == null) {
      total = lists.total;
    }
    playlists.push(...lists.items);
    offset += limit;
  } while (total == null || offset < total);

  return playlists;
}

async function getAllSavedAlbums(sdk: SpotifyApi) {
  const items: import('@spotify/web-api-ts-sdk').SavedAlbum[] = [];
  const limit = 50;
  let offset = 0;
  let total: number | null = null;
  do {
    // @ts-ignore sdk typing for currentUser saved albums
    const page = await sdk.currentUser.albums.savedAlbums(limit, offset);
    if (total == null) total = page.total;
    items.push(...page.items);
    offset += limit;
  } while (total == null || offset < total);

  return items;
}

async function getAllPlaylistTracksWithProgress(
  sdk: SpotifyApi,
  playlistId: string,
  onPage: (
    pageTracks: TrackResult[],
    pageIndex: number,
  ) => Promise<void> | void,
  abortSignal: AbortController,
  onRateLimit?: (retryAfterSeconds: number) => void,
  startingOffset: number = 0,
): Promise<TrackResult[]> {
  const tracks: TrackResult[] = [];
  const limit = 50;
  let offset = startingOffset;
  let total: number | null = null;
  let pageIndex = Math.floor(startingOffset / limit);

  do {
    if (abortSignal.signal.aborted) {
      break;
    }
    try {
      const items = await sdk.playlists.getPlaylistItems(
        playlistId,
        undefined,
        'total,limit,items(track(type,id,artists(type,name),name,preview_url, external_urls(spotify)))',
        limit,
        offset,
      );
      if (total == null) {
        total = items.total;
      }
      const filteredTracks = items.items
        .filter(item => item.track?.type === 'track' && item.track.id != null)
        .map((item: PlaylistedTrack): TrackResult => {
          return {
            id: item.track.id,
            name: item.track.name,
            artists: (item.track as Track).artists.map(artist => artist.name),
            preview_url: (item.track as Track).preview_url,
            spotify_url: (item.track as Track).external_urls.spotify,
          };
        });
      tracks.push(...filteredTracks);
      await onPage(filteredTracks, pageIndex++);
      offset += limit;
    } catch (error) {
      if (error instanceof RateLimitError) {
        const retry = Math.max(1, Math.ceil(error.retryAfter * 2));
        onRateLimit?.(retry);
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        continue;
      }
      throw error;
    }
  } while (total == null || offset < total);

  return tracks;
}

async function getAllAlbumTracks(
  sdk: SpotifyApi,
  albumId: string,
): Promise<TrackResult[]> {
  const tracks: TrackResult[] = [];
  const limit = 50;
  let offset = 0;
  let total: number | null = null;
  do {
    try {
      // @ts-ignore albums.tracks not in typed surface
      const market = undefined;
      const page = await sdk.albums.tracks(albumId, market, limit, offset);
      if (total == null) total = page.total;
      type AlbumTrack = {
        id: string;
        name: string;
        artists: {name: string}[];
        preview_url: string | null;
        external_urls: {spotify: string};
      };
      const mapped: TrackResult[] = page.items
        .filter((t: AlbumTrack) => t.id != null)
        .map((t: AlbumTrack) => ({
          id: t.id,
          name: t.name,
          artists: (t.artists || []).map((a: {name: string}) => a.name),
          preview_url: t.preview_url ?? null,
          spotify_url: t.external_urls.spotify,
        }));
      tracks.push(...mapped);
      offset += limit;
    } catch (error) {
      if (error instanceof RateLimitError) {
        const retry = Math.max(1, Math.ceil(error.retryAfter * 2));
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        continue;
      }
      throw error;
    }
  } while (total == null || offset < total);
  return tracks;
}

async function getTrackUrls(
  sdk: SpotifyApi,
  artist: string,
  song: string,
): Promise<null | {
  previewUrl: string | null;
  spotifyUrl: string;
}> {
  const track = await sdk.search(
    `track:${song} artist:${artist}`,
    ['track'],
    undefined, // market
    1, // limit
  );

  const item = track.tracks.items[0];

  const previewUrl = item.preview_url;
  const spotifyUrl = item.external_urls.spotify;
  return {
    previewUrl,
    spotifyUrl,
  };
}

export function useTrackUrls(
  artist: string,
  song: string,
): () => Promise<null | {
  previewUrl: string | null;
  spotifyUrl: string;
}> {
  const getPreviewUrl = useCallback(async () => {
    const sdk = await getSpotifySdk();

    if (sdk == null) {
      return null;
    }

    return await getTrackUrls(sdk, artist, song);
  }, [artist, song]);

  return getPreviewUrl;
}

export type SpotifyLibraryUpdateProgress = {
  playlists: PlaylistProgressMetadata;
  albums: AlbumProgressMetadata;
  rateLimitCountdown?: RateLimitState;
  updateStatus?: 'idle' | 'fetching' | 'complete' | 'error';
};

export type SpotifyLibraryMetadata = {
  playlistMetadata: PlaylistMetadata;
  albumMetadata: AlbumMetadata;
};

export type SpotifyLibrary = SpotifyLibraryMetadata & {
  playlistTracks: CachePlaylistTracks;
  albumTracks: CacheAlbumTracks;
};

export function useSpotifyLibraryUpdate(): [
  progress: SpotifyLibraryUpdateProgress,
  run: (
    abort: AbortController,
    options: {concurrency?: number},
  ) => Promise<SpotifyLibrary>,
] {
  const [progress, setProgress] = useState<SpotifyLibraryUpdateProgress>({
    playlists: {},
    albums: {},
    rateLimitCountdown: null,
    updateStatus: 'idle',
  });

  useEffect(() => {
    async function loadFromCache() {
      const cachedPlaylistTracks = await getCachedPlaylistTracks();
      const cachedPlaylistMetadata = await getCachedPlaylistMetadata();
      const cachedAlbumTracks = await getCachedAlbumTracks();
      const cachedAlbumMetadata = await getCachedAlbumMetadata();

      const initialPlaylistProgress: PlaylistProgressMetadata = Object.entries(
        cachedPlaylistMetadata,
      ).reduce((acc, [snapshotId, playlistMetadata]) => {
        const tracks = cachedPlaylistTracks[snapshotId] || [];
        const total = playlistMetadata.total ?? 0;
        const fetched = tracks.length ?? 0;
        const status: ProgressStatus =
          total > MAX_PLAYLIST_TRACKS_TO_FETCH
            ? 'done'
            : total === 0
              ? 'done'
              : fetched >= total
                ? 'done'
                : 'pending';
        acc[snapshotId] = {
          id: playlistMetadata.id ?? snapshotId,
          name: playlistMetadata.name,
          total,
          fetched,
          status,
          externalUrl: playlistMetadata.externalUrl,
          collaborative: playlistMetadata.collaborative,
          owner: playlistMetadata.owner,
        };
        return acc;
      }, {} as PlaylistProgressMetadata);

      const initialAlbumProgress: AlbumProgressMetadata = Object.entries(
        cachedAlbumMetadata,
      ).reduce((acc, [albumId, albumMetadata]) => {
        const tracks = cachedAlbumTracks[albumId] || [];
        const total = albumMetadata.totalTracks ?? 0;
        const fetched = tracks.length ?? 0;
        const status: ProgressStatus =
          total === 0 ? 'done' : fetched >= total ? 'done' : 'pending';
        acc[albumId] = {
          id: albumId,
          name: albumMetadata.name,
          totalTracks: total,
          fetched,
          status,
          addedAt: albumMetadata.addedAt,
          externalUrl: albumMetadata.externalUrl,
          artistName: albumMetadata.artistName,
        };
        return acc;
      }, {} as AlbumProgressMetadata);

      setProgress({
        playlists: initialPlaylistProgress,
        albums: initialAlbumProgress,
        rateLimitCountdown: null,
        updateStatus: 'idle',
      });
    }
    loadFromCache();
  }, []);

  const run = useCallback(
    (
      abortController: AbortController,
      options: {concurrency?: number},
    ): Promise<SpotifyLibrary> => {
      return new Promise(async (resolve, reject) => {
        const sdk = await getSpotifySdk();
        if (sdk == null) {
          reject(new Error('Spotify SDK not found'));
          return;
        }

        const [cachedPlaylistsTracks, cachedAlbumsTracks] = await Promise.all([
          getCachedPlaylistTracks(),
          getCachedAlbumTracks(),
        ]);

        setProgress(progress => ({
          ...progress,
          updateStatus: 'fetching',
        }));

        const {playlistMetadata, albumMetadata} =
          await getSpotifyLibraryMetadata(sdk);

        setProgress(prev => ({
          ...prev,
          playlists: Object.entries(playlistMetadata).reduce(
            (acc, [snapshot, p]) => {
              acc[snapshot] = {
                ...p,
                fetched: 0,
                status: 'pending',
              };
              return acc;
            },
            {} as PlaylistProgressMetadata,
          ),
          albums: Object.entries(albumMetadata).reduce(
            (acc, [albumId, album]) => {
              acc[albumId] = {
                ...album,
                fetched: 0,
                status: 'pending',
              };
              return acc;
            },
            {} as AlbumProgressMetadata,
          ),
          rateLimitCountdown: null,
          updateStatus: 'idle',
        }));

        const foundSnapshots: string[] = [];
        const foundAlbums: string[] = [];

        await pMap(
          Object.entries(playlistMetadata),
          async ([snapshot, p]) => {
            if (abortController.signal.aborted) return;

            foundSnapshots.push(snapshot);
            const cachedPlaylistTracks = cachedPlaylistsTracks[snapshot];

            const total = p.total;
            const cachedLen = cachedPlaylistTracks?.length ?? 0;

            if (cachedPlaylistTracks != null) {
              if (total > MAX_PLAYLIST_TRACKS_TO_FETCH) {
                setProgress(prev => ({
                  ...prev,
                  playlists: {
                    ...prev.playlists,
                    [snapshot]: {
                      ...prev.playlists[snapshot],
                      total,
                      fetched: 0,
                      status: 'done',
                    },
                  },
                }));
                return;
              }
              if (total === 0) {
                setProgress(prev => ({
                  ...prev,
                  playlists: {
                    ...prev.playlists,
                    [snapshot]: {
                      ...prev.playlists[snapshot],
                      total: 0,
                      fetched: 0,
                      status: 'done',
                    },
                  },
                }));
                return;
              }
              if (total > 0 && cachedLen >= total) {
                setProgress(prev => ({
                  ...prev,
                  playlists: {
                    ...prev.playlists,
                    [snapshot]: {
                      ...prev.playlists[snapshot],
                      total,
                      fetched: cachedLen,
                      status: 'done',
                    },
                  },
                }));
                return;
              }

              setProgress(prev => ({
                ...prev,
                playlists: {
                  ...prev.playlists,
                  [snapshot]: {
                    ...prev.playlists[snapshot],
                    total,
                    fetched: cachedLen,
                    status: 'fetching',
                  },
                },
              }));

              try {
                await getAllPlaylistTracksWithProgress(
                  sdk,
                  p.id,
                  async (pageTracks, _pageIndex) => {
                    cachedPlaylistsTracks[snapshot] =
                      cachedPlaylistsTracks[snapshot].concat(pageTracks);
                    await setCachedPlaylistTracks(cachedPlaylistsTracks);

                    const fetched = cachedPlaylistsTracks[snapshot].length;
                    setProgress(prev => ({
                      ...prev,
                      playlists: {
                        ...prev.playlists,
                        [snapshot]: {
                          ...prev.playlists[snapshot],
                          fetched,
                        },
                      },
                    }));
                  },
                  abortController,
                  retryAfterSeconds => {
                    setProgress(prev => ({
                      ...prev,
                      rateLimitCountdown: {retryAfterSeconds},
                    }));
                  },
                  cachedLen,
                );
              } catch (e) {
                console.error('Error resuming playlist', p.id, e);
                setProgress(prev => ({
                  ...prev,
                  playlists: {
                    ...prev.playlists,
                    [snapshot]: {
                      ...prev.playlists[snapshot],
                      status: 'error',
                      lastError: e instanceof Error ? e.message : String(e),
                    },
                  },
                }));
              }

              const finalFetched =
                cachedPlaylistsTracks[snapshot]?.length ?? cachedLen;

              setProgress(prev => ({
                ...prev,
                playlists: {
                  ...prev.playlists,
                  [snapshot]: {
                    ...prev.playlists[snapshot],
                    status: 'done',
                    fetched: finalFetched,
                    total: finalFetched,
                  },
                },
              }));
              setProgress(prev => ({
                ...prev,
                rateLimitCountdown: null,
              }));

              return;
            }

            // Fresh fetch (no cache)
            setProgress(prev => ({
              ...prev,
              playlists: {
                ...prev.playlists,
                [snapshot]: {
                  ...prev.playlists[snapshot],
                  status: 'fetching',
                },
              },
            }));

            if (total > MAX_PLAYLIST_TRACKS_TO_FETCH) {
              setProgress(prev => ({
                ...prev,
                playlists: {
                  ...prev.playlists,
                  [snapshot]: {
                    ...prev.playlists[snapshot],
                    total,
                    fetched: 0,
                    status: 'done',
                  },
                },
              }));
              return;
            }

            if (total === 0) {
              setProgress(prev => ({
                ...prev,
                playlists: {
                  ...prev.playlists,
                  [snapshot]: {
                    ...prev.playlists[snapshot],
                    total: 0,
                    fetched: 0,
                    status: 'done',
                  },
                },
              }));
              return;
            }

            if (cachedPlaylistsTracks[snapshot] == null) {
              cachedPlaylistsTracks[snapshot] = [];
              await setCachedPlaylistTracks(cachedPlaylistsTracks);
            }

            try {
              await getAllPlaylistTracksWithProgress(
                sdk,
                p.id,
                async (pageTracks, _pageIndex) => {
                  cachedPlaylistsTracks[snapshot] =
                    cachedPlaylistsTracks[snapshot].concat(pageTracks);
                  await setCachedPlaylistTracks(cachedPlaylistsTracks);

                  const fetched = cachedPlaylistsTracks[snapshot].length;
                  setProgress(prev => ({
                    ...prev,
                    playlists: {
                      ...prev.playlists,
                      [snapshot]: {
                        ...prev.playlists[snapshot],
                        fetched,
                      },
                    },
                  }));
                },
                abortController,
                retryAfterSeconds => {
                  setProgress(prev => ({
                    ...prev,
                    rateLimitCountdown: {retryAfterSeconds},
                  }));
                },
                0,
              );
            } catch (e) {
              console.error('Error fetching playlist', p.id, e);
              setProgress(prev => ({
                ...prev,
                playlists: {
                  ...prev.playlists,
                  [snapshot]: {
                    ...prev.playlists[snapshot],
                    status: 'error',
                    lastError: e instanceof Error ? e.message : String(e),
                  },
                },
              }));
            }

            const finalFetched =
              cachedPlaylistsTracks[snapshot]?.length ?? cachedLen;

            setProgress(prev => ({
              ...prev,
              playlists: {
                ...prev.playlists,
                [snapshot]: {
                  ...prev.playlists[snapshot],
                  status: 'done',
                  fetched: finalFetched,
                  total: finalFetched,
                },
              },
            }));
            setProgress(prev => ({
              ...prev,
              rateLimitCountdown: null,
            }));
          },
          {concurrency: options.concurrency ?? 3},
        );

        // Fetch saved album tracks
        await pMap(
          Object.entries(albumMetadata),
          async ([albumId, album]) => {
            if (abortController.signal.aborted) return;

            foundAlbums.push(albumId);
            const total = album.totalTracks ?? 0;
            const cachedAlbumTracks = cachedAlbumsTracks[albumId];
            if (cachedAlbumTracks) {
              setProgress(prev => ({
                ...prev,
                albums: {
                  ...prev.albums,
                  [albumId]: {
                    ...prev.albums[albumId],
                    totalTracks: total,
                    fetched: cachedAlbumTracks.length,
                    status:
                      cachedAlbumTracks.length >= total && total > 0
                        ? 'done'
                        : 'pending',
                  },
                },
              }));
              return;
            }
            setProgress(prev => ({
              ...prev,
              albums: {
                ...prev.albums,
                [albumId]: {
                  ...prev.albums[albumId],
                  status: 'fetching',
                },
              },
            }));

            try {
              const tracks = await getAllAlbumTracks(sdk, albumId);
              cachedAlbumsTracks[albumId] = tracks;
              await setCachedAlbumTracks(cachedAlbumsTracks);

              setProgress(prev => ({
                ...prev,
                albums: {
                  ...prev.albums,
                  [albumId]: {
                    ...prev.albums[albumId],
                    fetched: tracks.length,
                    totalTracks: total,
                    status: 'done',
                  },
                },
              }));
            } catch (e) {
              console.error('Error fetching album tracks', albumId, e);
              setProgress(prev => ({
                ...prev,
                albums: {
                  ...prev.albums,
                  [albumId]: {
                    ...prev.albums[albumId],
                    status: 'error',
                  },
                },
              }));
            }
          },
          {concurrency: options.concurrency ?? 3},
        );

        const newPlaylistCache = foundSnapshots.reduce(
          (acc: {[snapshotId: string]: TrackResult[]}, snapshot: string) => {
            acc[snapshot] = cachedPlaylistsTracks[snapshot];
            return acc;
          },
          {},
        );
        await setCachedPlaylistTracks(newPlaylistCache);

        const newAlbumCache = foundAlbums.reduce(
          (acc: {[albumId: string]: TrackResult[]}, albumId: string) => {
            acc[albumId] = cachedAlbumsTracks[albumId];
            return acc;
          },
          {},
        );
        await setCachedAlbumTracks(newAlbumCache);
        setProgress(prev => ({
          ...prev,
          updateStatus: 'complete',
        }));

        resolve({
          playlistMetadata: progress.playlists,
          albumMetadata: progress.albums,
          playlistTracks: newPlaylistCache,
          albumTracks: newAlbumCache,
        });
      });
    },
    [],
  );

  return [progress, run];
}

export async function getSpotifyLibraryMetadata(
  sdk: SpotifyApi,
): Promise<SpotifyLibraryMetadata> {
  const [playlists, savedAlbums] = await Promise.all([
    getAllPlaylists(sdk),
    getAllSavedAlbums(sdk),
  ]);
  const playlistMetadata = playlists.reduce((acc: PlaylistMetadata, p) => {
    const snapshot: string = p.snapshot_id;

    acc[snapshot] = {
      ...p,
      externalUrl: p.external_urls.spotify,
      owner: {
        displayName: p.owner.display_name,
        externalUrl: p.owner.external_urls.spotify,
      },
      total: p.tracks?.total ?? 0,
    };
    return acc;
  }, {} as PlaylistMetadata);

  const albumMetadata = savedAlbums.reduce((acc: AlbumMetadata, s) => {
    acc[s.album.id] = {
      id: s.album.id,
      name: s.album.name,
      externalUrl: s.album.external_urls.spotify,
      artistName: s.album.artists[0].name,
      addedAt: s.added_at,
      totalTracks: s.album.total_tracks,
    };
    return acc;
  }, {} as AlbumMetadata);

  await Promise.all([
    setCachedPlaylistMetadata(playlistMetadata),
    setCachedAlbumMetadata(albumMetadata),
  ]);

  return {
    playlistMetadata,
    albumMetadata,
  };
}

export function getTrackMap(library: SpotifyLibrary): Map<string, TrackResult> {
  return [
    ...Object.values(library.playlistTracks)
      .filter(playlistTracks => {
        if (playlistTracks?.length == null) {
          return false;
        }
        return playlistTracks.length < MAX_PLAYLIST_TRACKS_TO_FETCH;
      })
      .flat(),
    ...Object.values(library.albumTracks).flat(),
  ].reduce((acc, track) => {
    const key = `${track.name} - ${track.artists.join(', ')}`.toLowerCase();
    if (!acc.has(key)) {
      acc.set(key, track);
    }
    return acc;
  }, new Map<string, TrackResult>());
}
