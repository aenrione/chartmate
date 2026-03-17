import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {model} from '@coderline/alphatab';
import AlphaTabWrapper from './AlphaTabWrapper';
import type {AlphaTabHandle} from './AlphaTabWrapper';

type Score = InstanceType<typeof model.Score>;

/**
 * Minimal test page: /guitar/test?file=/test-data/full-song.gp5
 * No Radix UI, no sidebar — just alphaTab + basic controls.
 */
export default function GuitarTestPage() {
  const alphaTabRef = useRef<AlphaTabHandle>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileUrl = useMemo(() => new URLSearchParams(window.location.search).get('file'), []);

  useEffect(() => {
    if (!fileUrl) return;
    fetch(fileUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buf => setFileData(new Uint8Array(buf)))
      .catch(err => setError(String(err)));
  }, [fileUrl]);

  const onScoreLoaded = useCallback((s: Score) => {
    setScore(s);
    console.log('Score loaded:', s.title, s.artist, s.tracks.length, 'tracks');
  }, []);

  const onPositionChanged = useCallback((cur: number, end: number) => {
    setCurrentTime(cur);
    setEndTime(end);
  }, []);

  const onPlayerStateChanged = useCallback((state: number) => {
    setIsPlaying(state === 1);
  }, []);

  const onPlayerReady = useCallback(() => {
    setIsPlayerReady(true);
    console.log('Player ready');
  }, []);

  if (!fileUrl) {
    return (
      <div style={{padding: 40, fontFamily: 'sans-serif'}}>
        <h1>Guitar Tab Test</h1>
        <p>Usage: <code>/guitar/test?file=/test-data/full-song.gp5</code></p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{padding: 40, fontFamily: 'sans-serif', color: 'red'}}>
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      {/* Simple transport */}
      <div style={{padding: '8px 16px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12, alignItems: 'center'}}>
        <button
          onClick={() => alphaTabRef.current?.playPause()}
          disabled={!isPlayerReady}
          style={{padding: '4px 12px', cursor: 'pointer'}}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => alphaTabRef.current?.stop()}
          disabled={!isPlayerReady}
          style={{padding: '4px 12px', cursor: 'pointer'}}
        >
          Stop
        </button>
        <span style={{fontFamily: 'monospace', fontSize: 13}}>
          {formatTime(currentTime)} / {formatTime(endTime)}
        </span>
        {score && (
          <span style={{fontSize: 13, color: '#666'}}>
            {score.title} — {score.artist} ({score.tracks.length} tracks, {score.masterBars.length} bars)
          </span>
        )}
        {!isPlayerReady && <span style={{fontSize: 12, color: '#999'}}>Loading player...</span>}
      </div>

      {/* AlphaTab */}
      <AlphaTabWrapper
        ref={alphaTabRef}
        fileData={fileData}
        enablePlayer={true}
        onScoreLoaded={onScoreLoaded}
        onPositionChanged={onPositionChanged}
        onPlayerStateChanged={onPlayerStateChanged}
        onPlayerReady={onPlayerReady}
        className="flex-1"
      />
    </div>
  );
}
