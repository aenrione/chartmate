import {Measure, DrumNoteInstrument, mapping} from './convertToVexflow';

export const ALL_DRUM_INSTRUMENTS: DrumNoteInstrument[] = [
  'kick',
  'snare',
  'hihat',
  'ride',
  'crash',
  'high-tom',
  'mid-tom',
  'floor-tom',
];

export const DRUM_INSTRUMENT_LABELS: Record<DrumNoteInstrument, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
  ride: 'Ride',
  crash: 'Crash',
  'high-tom': 'High Tom',
  'mid-tom': 'Mid Tom',
  'floor-tom': 'Floor Tom',
};

// VexFlow pitch → DrumNoteInstrument
const reverseMapping: Record<string, DrumNoteInstrument> = {};
for (const [instrument, pitch] of Object.entries(mapping)) {
  reverseMapping[pitch] = instrument as DrumNoteInstrument;
}

const SAMPLE_RATE = 22050;
const GAIN = 0.3;

const SAMPLE_FILES: Record<DrumNoteInstrument, string> = {
  kick: 'kick.mp3',
  snare: 'snare.mp3',
  hihat: 'hihat.mp3',
  ride: 'ride.mp3',
  crash: 'crash.mp3',
  'high-tom': 'high-tom.mp3',
  'mid-tom': 'mid-tom.mp3',
  'floor-tom': 'floor-tom.mp3',
};

async function decodeAndResample(
  audioCtx: AudioContext,
  arrayBuffer: ArrayBuffer,
): Promise<Float32Array> {
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  const targetLength = Math.ceil(SAMPLE_RATE * decoded.duration);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offlineCtx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(1, targetLength, SAMPLE_RATE);

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = GAIN;
  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}

async function loadAllSamples(): Promise<Record<DrumNoteInstrument, Float32Array>> {
  const audioCtx = new AudioContext();

  // Fetch all files in parallel
  const buffers = await Promise.all(
    ALL_DRUM_INSTRUMENTS.map(async (inst) => {
      const url = `${import.meta.env.BASE_URL}drum-samples/${SAMPLE_FILES[inst]}`;
      const response = await fetch(url);
      return {inst, data: await response.arrayBuffer()};
    }),
  );

  // Decode sequentially with a single AudioContext
  const result: Partial<Record<DrumNoteInstrument, Float32Array>> = {};
  for (const {inst, data} of buffers) {
    result[inst] = await decodeAndResample(audioCtx, data);
  }

  audioCtx.close();
  return result as Record<DrumNoteInstrument, Float32Array>;
}

function mixSamples(
  target: Float32Array,
  source: Float32Array,
  offset: number,
): void {
  for (let i = 0; i < source.length; i++) {
    const idx = offset + i;
    if (idx < target.length) {
      target[idx] += source[i];
    }
  }
}

function float32ToWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const totalSize = 44 + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  const writeU32 = (v: number) => {
    view.setUint32(offset, v, true);
    offset += 4;
  };
  const writeU16 = (v: number) => {
    view.setUint16(offset, v, true);
    offset += 2;
  };

  writeString('RIFF');
  writeU32(totalSize - 8);
  writeString('WAVE');
  writeString('fmt ');
  writeU32(16);
  writeU16(1);
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(bitsPerSample);
  writeString('data');
  writeU32(dataSize);

  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Generates a synthetic drum track WAV from chart measures using real acoustic samples.
 * Only includes instruments present in `enabledInstruments`.
 */
export async function generateSyntheticDrumTrack(
  measures: Measure[],
  enabledInstruments: Set<DrumNoteInstrument>,
): Promise<Uint8Array> {
  if (measures.length === 0) {
    throw new Error('No measures provided');
  }

  const before = performance.now();
  const totalMs = measures[measures.length - 1].endMs;
  const totalSamples = Math.ceil(SAMPLE_RATE * (totalMs / 1000));
  const trackBuffer = new Float32Array(totalSamples);

  const sampleMap = await loadAllSamples();

  for (const measure of measures) {
    for (const beat of measure.beats) {
      for (const note of beat.notes) {
        if (note.isRest) continue;
        for (const pitchStr of note.notes) {
          const instrument = reverseMapping[pitchStr];
          if (!instrument || !enabledInstruments.has(instrument)) continue;
          const sampleOffset = Math.floor((note.ms / 1000) * SAMPLE_RATE);
          mixSamples(trackBuffer, sampleMap[instrument], sampleOffset);
        }
      }
    }
  }

  const wav = float32ToWav(trackBuffer, SAMPLE_RATE);
  console.log(`Synthetic drum track: ${(performance.now() - before).toFixed(0)}ms`);
  return wav;
}
