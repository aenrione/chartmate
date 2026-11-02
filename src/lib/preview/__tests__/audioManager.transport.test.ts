import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AudioManager} from '../audioManager';

class Source extends EventTarget {
  buffer: unknown;
  playbackRate = {setValueAtTime: vi.fn(), value: 1};
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  static latest: Context;
  static decoding: Promise<AudioBuffer> | null = null;
  state = 'running';
  currentTime = 0;
  destination = {};
  sources: Source[] = [];
  constructor() { Context.latest = this; }
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(() => Context.decoding ?? Promise.resolve({duration: 120} as AudioBuffer));
  createGain() {
    return {gain: {setValueAtTime: vi.fn()}, connect: vi.fn(), disconnect: vi.fn()};
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
}
const files = [{fileName: 'guitar', data: new Uint8Array(8)}];

beforeEach(() => { Context.decoding = null; vi.stubGlobal('AudioContext', Context); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('AudioManager transport', () => {
  it('can play again after Stop rather than confusing a running context with active audio', async () => {
    const manager = new AudioManager(files, vi.fn());
    await manager.ready;
    await manager.play({time: 3});
    expect(manager.isPlaying).toBe(true);
    await manager.stop();
    expect(manager.isPlaying).toBe(false);
    expect(manager.isInitialized).toBe(false);
    expect(manager.currentTime).toBe(0);
    await manager.play({time: 7});
    expect(manager.isPlaying).toBe(true);
    expect(Context.latest.sources[0].stop).toHaveBeenCalled();
    expect(Context.latest.sources[1].start).toHaveBeenCalledWith(0, 7);
    manager.destroy();
  });

  it('replaces sources when seeking without suspending the audio between notes', async () => {
    const manager = new AudioManager(files, vi.fn());
    await manager.ready;
    await manager.play({time: 0});
    Context.latest.suspend.mockClear();
    await manager.play({time: 45});
    expect(Context.latest.suspend).not.toHaveBeenCalled();
    expect(Context.latest.sources[0].stop).toHaveBeenCalledOnce();
    expect(Context.latest.sources[1].start).toHaveBeenCalledWith(0, 45);
    manager.destroy();
  });

  it('does not start decoded sources when pause superseded an unfinished play request', async () => {
    let finish!: (buffer: AudioBuffer) => void;
    Context.decoding = new Promise(resolve => { finish = resolve; });
    const manager = new AudioManager(files, vi.fn());
    // Allow decoding to start while play waits for readiness.
    await Promise.resolve();
    const playing = manager.play({time: 10});
    await manager.pause();
    finish({duration: 120} as AudioBuffer);
    await playing;
    expect(Context.latest.sources).toHaveLength(0);
    expect(manager.isPlaying).toBe(false);
    manager.destroy();
  });

  it('does not recreate tracks or start audio after destruction during decoding', async () => {
    let finish!: (buffer: AudioBuffer) => void;
    Context.decoding = new Promise(resolve => { finish = resolve; });
    const manager = new AudioManager(files, vi.fn());
    await Promise.resolve();
    const playing = manager.play({time: 0});
    manager.destroy();
    finish({duration: 120} as AudioBuffer);
    await playing;
    expect(Context.latest.sources).toHaveLength(0);
    expect(manager.isPlaying).toBe(false);
  });
});
