import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {TabSource, TabSearchResult} from './types';

type SongsterrTrack = {
  instrumentId: number;
  instrument: string;
  views: number;
  name: string;
  tuning: number[];
  difficulty?: number;
  hash: string;
};

type SongsterrSong = {
  songId: number;
  artistId: number;
  artist: string;
  title: string;
  hasChords: boolean;
  hasPlayer: boolean;
  tracks: SongsterrTrack[];
  defaultTrack: number;
  isJunk: boolean;
};

export const SongsterrSource: TabSource = {
  sourceId: 'songsterr',
  name: 'Songsterr',

  async search(query: string): Promise<TabSearchResult[]> {
    const url = `https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(query)}`;
    const response = await tauriFetch(url, {
      headers: {accept: 'application/json'},
    });
    if (!response.ok) {
      throw new Error(`Songsterr search failed: ${response.status}`);
    }
    const songs: SongsterrSong[] = await response.json();
    return songs
      .filter(s => !s.isJunk && s.hasPlayer)
      .map(song => ({
        id: String(song.songId),
        title: song.title,
        artist: song.artist,
        sourceId: 'songsterr',
        // GP5 download requires Songsterr Plus auth — not yet implemented
        hasGp: false,
        viewUrl: `https://www.songsterr.com/a/wsa/${song.artist.toLowerCase().replace(/\s+/g, '-')}-${song.title.toLowerCase().replace(/\s+/g, '-')}-s${song.songId}`,
      }));
  },

  async getDownloadUrl(_result: TabSearchResult): Promise<string> {
    throw new Error(
      'Songsterr GP5 download requires authentication. This will be supported in a future update.',
    );
  },
};
