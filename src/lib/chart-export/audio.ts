/**
 * The audio stem for an exported chart folder.
 *
 * Clone Hero and YARG refuse to load a chart with no audio at all, and we must
 * not ship copyrighted masters — so the stem is always synthesised from the
 * user's own tab through AlphaTab's SoundFont, never taken from a recording.
 *
 * The file is WAV, not OGG: scan-chart, Clone Hero and YARG all accept
 * `song.wav`, and there is no Vorbis encoder anywhere in this dependency tree.
 * Adding one to save disk on a practice loop is not a trade worth making.
 */

import type {AlphaTabApi, model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

export const AUDIO_FILE_NAME = 'song.wav';
const SAMPLE_RATE = 44100;
const CHANNELS = 2;

/** Interleaved float samples → a 16-bit PCM RIFF file. */
export function encodeWav(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
  channels = CHANNELS,
): Uint8Array {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

/**
 * A stem of pure silence. Used when no SoundFont render is available — the
 * folder still loads and the chart still plays, you just hear nothing but
 * your own kit. Callers should say so rather than letting it pass silently.
 *
 * Mono at 8 kHz, not stereo at 44.1: forty rudiments of stereo CD-rate silence
 * is 180 MB of zeros on disk, and nothing about silence needs the fidelity.
 */
export const SILENT_SAMPLE_RATE = 8000;

export function silentWav(milliseconds: number): Uint8Array {
  const frames = Math.max(1, Math.ceil((milliseconds / 1000) * SILENT_SAMPLE_RATE));
  return encodeWav(new Float32Array(frames), SILENT_SAMPLE_RATE, 1);
}

export interface RenderAudioOptions {
  /** Extra silence appended so the last hit is not cut off. */
  tailMs?: number;
  soundFonts?: Uint8Array[];
  /** Rough chunk size asked of the exporter. */
  chunkMs?: number;
}

/**
 * Render a Score through an existing AlphaTab api's SoundFont.
 *
 * Takes the api rather than creating one because a synthesiser needs an audio
 * output, and the app already has one wherever a tab is on screen.
 */
export async function renderScoreToWav(
  api: AlphaTabApi,
  score: Score,
  options: RenderAudioOptions = {},
): Promise<Uint8Array> {
  const {tailMs = 1500, chunkMs = 2000} = options;

  // renderScore is the only public way to put a score into an api instance.
  api.renderScore(score);

  const exportOptions = new (await import('@coderline/alphatab')).synth.AudioExportOptions();
  exportOptions.sampleRate = SAMPLE_RATE;
  exportOptions.metronomeVolume = 0;
  if (options.soundFonts) exportOptions.soundFonts = options.soundFonts;

  const exporter = await api.exportAudio(exportOptions);
  const chunks: Float32Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await exporter.render(chunkMs);
      if (!chunk) break;
      chunks.push(chunk.samples);
      total += chunk.samples.length;
    }
  } finally {
    exporter.destroy();
  }

  const tailFrames = Math.ceil((tailMs / 1000) * SAMPLE_RATE) * CHANNELS;
  const samples = new Float32Array(total + tailFrames);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return encodeWav(samples);
}
