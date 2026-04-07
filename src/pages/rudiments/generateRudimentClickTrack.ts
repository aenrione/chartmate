import type { Measure } from '@/pages/sheet-music/drumTypes';

const CLICK_DURATION = 0.05; // 50ms
const STRONG_TONE = 1000; // Hz for downbeat
const NOTE_TONE = 800; // Hz for regular notes

// Distinct L/R tones — subtle but noticeable difference
const RIGHT_TONE = 900; // Hz — slightly higher, brighter
const LEFT_TONE = 700;  // Hz — slightly lower, darker

/**
 * Generate a click sample as raw PCM data.
 */
function generateClickSample(
  frequency: number,
  durationSec: number,
  sampleRate: number,
  volume: number,
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = t < 0.005
      ? t / 0.005
      : Math.max(0, 1 - (t - 0.005) / (durationSec - 0.01));
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * volume;
  }
  return samples;
}

/**
 * Mix a source sample into a target buffer at the given offset.
 */
function mixSamples(target: Float32Array, source: Float32Array, offset: number): void {
  for (let i = 0; i < source.length; i++) {
    const idx = offset + i;
    if (idx < target.length) {
      target[idx] += source[i];
    }
  }
}

/**
 * Convert mono Float32Array PCM to 16-bit WAV Uint8Array.
 */
function float32ToWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = bitsPerSample / 8;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); }
  function writeU32(v: number) { view.setUint32(offset, v, true); offset += 4; }
  function writeU16(v: number) { view.setUint16(offset, v, true); offset += 2; }

  writeStr('RIFF');
  writeU32(36 + dataSize);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(16);
  writeU16(1);
  writeU16(1);
  writeU32(sampleRate);
  writeU32(sampleRate * blockAlign);
  writeU16(blockAlign);
  writeU16(bitsPerSample);
  writeStr('data');
  writeU32(dataSize);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Determine if a sticking token represents a right hand hit.
 * R, lR, rrR → right. L, rL, llL → left.
 */
function isRightHand(token: string): boolean {
  // The main stroke is the last uppercase letter
  return token.endsWith('R');
}

/**
 * Generate a click track that clicks on EVERY NOTE position.
 *
 * @param stickingAnnotations - Optional R/L annotations per note.
 *   When provided with distinctLR=true, right and left hands get different tones.
 * @param distinctLR - When true, use different tones for L vs R hands.
 */
export function generateRudimentClickTrack(
  measures: Measure[],
  volume: number = 0.7,
  stickingAnnotations?: string[],
  distinctLR: boolean = false,
): Uint8Array {
  if (measures.length === 0) {
    throw new Error('No measures provided');
  }

  const totalDurationMs = measures[measures.length - 1].endMs;
  const sampleRate = 8000;
  const totalSamples = Math.ceil(sampleRate * (totalDurationMs / 1000)) + sampleRate;
  const trackBuffer = new Float32Array(totalSamples);

  const strongSample = generateClickSample(STRONG_TONE, CLICK_DURATION, sampleRate, volume);
  const noteSample = generateClickSample(NOTE_TONE, CLICK_DURATION, sampleRate, volume * 0.8);
  const rightSample = generateClickSample(RIGHT_TONE, CLICK_DURATION, sampleRate, volume * 0.9);
  const leftSample = generateClickSample(LEFT_TONE, CLICK_DURATION, sampleRate, volume * 0.8);

  let noteIndex = 0;
  const annLength = stickingAnnotations?.length ?? 0;

  for (const measure of measures) {
    for (const note of measure.notes) {
      if (note.isRest) continue;
      const timeSec = note.ms / 1000;
      const sampleIdx = Math.floor(timeSec * sampleRate);

      const isDownbeat = Math.abs(note.ms - measure.startMs) < 1;

      if (distinctLR && stickingAnnotations && annLength > 0) {
        const ann = stickingAnnotations[noteIndex % annLength];
        const right = isRightHand(ann);
        if (isDownbeat) {
          // Downbeat still gets a strong tone, but pick the L/R variant
          mixSamples(trackBuffer, right ? rightSample : leftSample, sampleIdx);
        } else {
          mixSamples(trackBuffer, right ? rightSample : leftSample, sampleIdx);
        }
      } else {
        mixSamples(trackBuffer, isDownbeat ? strongSample : noteSample, sampleIdx);
      }

      noteIndex++;
    }
  }

  return float32ToWav(trackBuffer, sampleRate);
}
