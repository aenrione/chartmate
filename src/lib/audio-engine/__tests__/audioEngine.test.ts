import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock AudioContext — jsdom doesn't implement Web Audio API
const mockOscillator = {
  type: 'sine',
  frequency: {value: 0},
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};
const mockGain = {
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
};
const mockCtx = {
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain),
  destination: {},
  currentTime: 0,
  state: 'running',
};

vi.stubGlobal('AudioContext', vi.fn(() => mockCtx));

describe('audioEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('noteToMidi returns 60 for C4', async () => {
    const {noteToMidi} = await import('../index');
    expect(noteToMidi('C', 4)).toBe(60);
  });

  it('noteToMidi returns 69 for A4', async () => {
    const {noteToMidi} = await import('../index');
    expect(noteToMidi('A', 4)).toBe(69);
  });

  it('midiToFreq returns 440 for A4 (midi 69)', async () => {
    const {midiToFreq} = await import('../index');
    expect(midiToFreq(69)).toBeCloseTo(440, 0);
  });

  it('midiToFreq returns 261.6 for C4 (midi 60)', async () => {
    const {midiToFreq} = await import('../index');
    expect(midiToFreq(60)).toBeCloseTo(261.6, 0);
  });
});
