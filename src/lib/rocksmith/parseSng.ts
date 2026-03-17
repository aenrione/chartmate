/**
 * Browser-compatible Rocksmith SNG binary format parser.
 * SNG files contain all note/chord/section data in a compact binary format.
 *
 * Format: magic(4) + platform(4) + iv(16) + encrypted_payload + signature(56)
 * After decryption: uncompressed_length(4) + zlib_compressed_data
 * After decompression: sequential binary structures (all little-endian)
 */

// @ts-expect-error aes-js has no types
import aesjs from 'aes-js';

import type {
  RocksmithArrangement,
  RocksmithBeat,
  RocksmithNote,
  RocksmithChord,
  RocksmithChordTemplate,
  RocksmithSection,
  RocksmithPhrase,
  RocksmithPhraseIteration,
} from './types';

const WIN_KEY_HEX = 'CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30';
const MAC_KEY_HEX = '9821330E34B91F70D0A48CBD625993126970CEA09192C0E6CDA676CC9838289D';

/** Inflate zlib-compressed data using DecompressionStream */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  async function tryDecompress(format: string): Promise<Uint8Array> {
    const ds = new DecompressionStream(format as CompressionFormat);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(data);
    writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      result.set(c, off);
      off += c.length;
    }
    return result;
  }

  // Try zlib (deflate with header) first, fall back to raw
  try {
    return await tryDecompress('deflate');
  } catch {
    return await tryDecompress('raw');
  }
}

/** Decrypt SNG payload using AES-256-CTR via aes-js */
function decryptSng(encrypted: Uint8Array, iv: Uint8Array, platform: 'windows' | 'mac'): Uint8Array {
  const keyHex = platform === 'mac' ? MAC_KEY_HEX : WIN_KEY_HEX;
  const key = aesjs.utils.hex.toBytes(keyHex);
  // aes-js Counter takes the initial counter value from the IV
  const ctr = iv[0] << 24 | iv[1] << 16 | iv[2] << 8 | iv[3];
  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(ctr));
  // Pad to 16-byte boundary for aes-js
  const padded = new Uint8Array(Math.ceil(encrypted.length / 16) * 16);
  padded.set(encrypted);
  const decrypted = aesCtr.decrypt(padded);
  return new Uint8Array(decrypted).slice(0, encrypted.length);
}

/** Simple binary reader with cursor */
class BinaryReader {
  private view: DataView;
  private data: Uint8Array;
  pos: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = 0;
  }

  u8(): number { return this.data[this.pos++]; }
  i8(): number { const v = this.view.getInt8(this.pos); this.pos++; return v; }
  u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16(): number { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  f32(): number { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64(): number { const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
  skip(n: number) { this.pos += n; }

  str(len: number): string {
    const bytes = this.data.slice(this.pos, this.pos + len);
    this.pos += len;
    const nullIdx = bytes.indexOf(0);
    const end = nullIdx >= 0 ? nullIdx : len;
    return new TextDecoder().decode(bytes.slice(0, end));
  }
}

// Note mask flags
const NOTE_MASK = {
  hammerOn:     0x00000200,
  pullOff:      0x00000400,
  harmonic:     0x00000020,
  harmonicPinch: 0x00008000,
  palmMute:     0x00000002,
  mute:         0x00000040,
  tremolo:      0x40000000,
  accent:       0x04000000,
  linkNext:     0x00000008,
  ignore:       0x00040000,
};

interface SngNoteRaw {
  mask: number;
  flags: number;
  time: number;
  string: number;
  fret: number;
  chordId: number;
  slideTo: number;
  slideUnpitchTo: number;
  tap: number;
  vibrato: number;
  sustain: number;
  maxBend: number;
  bendCount: number;
  bends: {time: number; step: number}[];
}

function readNote(r: BinaryReader): SngNoteRaw {
  const mask = r.u32();
  const flags = r.u32();
  r.u32(); // hash
  const time = r.f32();
  const string = r.i8();
  const fret = r.i8();
  r.i8(); // anchorFret
  r.i8(); // anchorWidth
  const chordId = r.i32();
  r.u32(); // chordNoteId
  r.u32(); // phraseId
  r.u32(); // phraseIterationId
  r.u16(); r.u16(); // fingerPrintId[2]
  r.u16(); // nextIterNote
  r.u16(); // prevIterNote
  r.u16(); // parentPrevNote
  const slideTo = r.i8();
  const slideUnpitchTo = r.i8();
  r.i8(); // leftHand
  const tap = r.i8();
  r.i8(); // pickDirection
  r.i8(); // slap
  r.i8(); // pluck
  const vibrato = r.i16();
  const sustain = r.f32();
  const maxBend = r.f32();

  const bendCount = r.u32();
  const bends: {time: number; step: number}[] = [];
  for (let i = 0; i < bendCount; i++) {
    const bTime = r.f32();
    const step = r.f32();
    r.skip(3); // padding
    r.i8(); // UNK
    bends.push({time: bTime, step});
  }

  return {mask, flags, time, string, fret, chordId, slideTo, slideUnpitchTo, tap, vibrato, sustain, maxBend, bendCount, bends};
}

export interface SngManifestInfo {
  arrangementName: string;
  songName: string;
  artistName: string;
  albumName: string;
}

/**
 * Parse decrypted+decompressed SNG binary data into a RocksmithArrangement.
 */
function parseSngBinary(data: Uint8Array, manifest?: SngManifestInfo): RocksmithArrangement {
  const r = new BinaryReader(data);

  // Beats
  const beatsCount = r.u32();
  const beats: RocksmithBeat[] = [];
  for (let i = 0; i < beatsCount; i++) {
    const time = r.f32();
    const measure = r.u16();
    const beat = r.u16();
    r.u32(); // phraseIteration
    r.u32(); // mask
    beats.push({time, measure: beat === 0 ? measure : -1});
  }

  // Phrases
  const phrasesCount = r.u32();
  const phrases: RocksmithPhrase[] = [];
  for (let i = 0; i < phrasesCount; i++) {
    r.i8(); // solo
    r.i8(); // disparity
    r.i8(); // ignore
    r.i8(); // padding
    const maxDifficulty = r.u32();
    r.u32(); // phraseIterationLinks
    const name = r.str(32);
    phrases.push({name, maxDifficulty});
  }

  // Chord templates
  const chordTemplatesCount = r.u32();
  const chordTemplates: RocksmithChordTemplate[] = [];
  for (let i = 0; i < chordTemplatesCount; i++) {
    r.u32(); // mask
    const frets: number[] = [];
    for (let s = 0; s < 6; s++) frets.push(r.i8());
    const fingers: number[] = [];
    for (let s = 0; s < 6; s++) fingers.push(r.i8());
    const notes: number[] = [];
    for (let s = 0; s < 6; s++) notes.push(r.i32());
    const name = r.str(32);
    chordTemplates.push({
      chordId: i,
      chordName: name,
      displayName: name,
      fingers,
      frets,
    });
  }

  // Chord notes (predefined note-level detail for chord shapes)
  const chordNotesCount = r.u32();
  const chordNotesData: {
    mask: number[];
    slideTo: number[];
    slideUnpitchTo: number[];
    vibrato: number[];
  }[] = [];
  for (let i = 0; i < chordNotesCount; i++) {
    const mask = [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()];
    // Skip bends (6 strings × (32 bends × 8 bytes + 4 count bytes))
    r.skip(6 * (32 * 8 + 4));
    const slideTo = [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()];
    const slideUnpitchTo = [r.i8(), r.i8(), r.i8(), r.i8(), r.i8(), r.i8()];
    const vibrato = [r.i16(), r.i16(), r.i16(), r.i16(), r.i16(), r.i16()];
    chordNotesData.push({mask, slideTo, slideUnpitchTo, vibrato});
  }

  // Vocals (skip)
  const vocalsCount = r.u32();
  for (let i = 0; i < vocalsCount; i++) {
    r.f32(); // time
    r.i32(); // note
    r.f32(); // length
    r.str(48); // lyrics
  }

  // Symbols (only present if vocals > 0)
  if (vocalsCount > 0) {
    const haLen = r.u32();
    r.skip(haLen * 32); // header array (8 × int32 per entry)
    const texLen = r.u32();
    r.skip(texLen * (128 + 4 + 4 + 4 + 4)); // texture
    const defLen = r.u32();
    r.skip(defLen * (12 + 16 + 16)); // definition (name + 2 rects)
  }

  // Phrase iterations
  const phraseIterCount = r.u32();
  const phraseIterations: RocksmithPhraseIteration[] = [];
  for (let i = 0; i < phraseIterCount; i++) {
    const phraseId = r.u32();
    const time = r.f32();
    const nextPhraseTime = r.f32();
    r.skip(12); // difficulty[3]
    phraseIterations.push({phraseId, time, endTime: nextPhraseTime});
  }

  // Phrase extra info (skip)
  const phraseExtraCount = r.u32();
  r.skip(phraseExtraCount * 12);

  // New linked diffs (skip - variable length)
  const nldCount = r.u32();
  for (let i = 0; i < nldCount; i++) {
    r.i32(); // levelBreak
    const nldPhraseLen = r.u32();
    r.skip(nldPhraseLen * 4);
  }

  // Actions (skip)
  const actionsCount = r.u32();
  r.skip(actionsCount * (4 + 256));

  // Events (skip)
  const eventsCount = r.u32();
  r.skip(eventsCount * (4 + 256));

  // Tones (skip)
  const toneCount = r.u32();
  r.skip(toneCount * 8);

  // DNA (skip)
  const dnaCount = r.u32();
  r.skip(dnaCount * 8);

  // Sections
  const sectionsCount = r.u32();
  const sections: RocksmithSection[] = [];
  for (let i = 0; i < sectionsCount; i++) {
    const name = r.str(32);
    const number = r.u32();
    const startTime = r.f32();
    const endTime = r.f32();
    r.u32(); // startPhraseIterationId
    r.u32(); // endPhraseIterationId
    r.skip(36); // stringMask
    sections.push({name, number, startTime, endTime});
  }

  // Levels (contains the actual notes!)
  const levelsCount = r.u32();
  let maxDiffNotes: SngNoteRaw[] = [];
  let maxDiff = -1;

  for (let l = 0; l < levelsCount; l++) {
    const difficulty = r.u32();

    // Anchors
    const anchorsCount = r.u32();
    r.skip(anchorsCount * (4 + 4 + 4 + 4 + 4 + 4 + 4)); // 7 fields

    // Anchor extensions
    const anchorExtCount = r.u32();
    r.skip(anchorExtCount * (4 + 1 + 7));

    // Fingerprints (2 arrays)
    for (let fp = 0; fp < 2; fp++) {
      const fpCount = r.u32();
      r.skip(fpCount * (4 + 4 + 4 + 4 + 4)); // 5 fields
    }

    // Notes
    const notesCount = r.u32();
    const levelNotes: SngNoteRaw[] = [];
    for (let n = 0; n < notesCount; n++) {
      levelNotes.push(readNote(r));
    }

    // Average notes per iteration (skip)
    const avgNotesCount = r.u32();
    r.skip(avgNotesCount * 4);

    // Notes in iteration count (no ignored)
    const niicNoIgn = r.u32();
    r.skip(niicNoIgn * 4);

    // Notes in iteration count
    const niic = r.u32();
    r.skip(niic * 4);

    // Keep the level with the most notes (richest arrangement)
    if (levelNotes.length > maxDiffNotes.length) {
      maxDiff = difficulty;
      maxDiffNotes = levelNotes;
    }
  }

  // Metadata
  r.f64(); // maxScores
  r.f64(); // maxNotesAndChords
  r.f64(); // maxNotesAndChords_Real
  r.f64(); // pointsPerNote
  r.f32(); // firstBeatLength
  r.f32(); // startTime
  const capo = r.i8();
  r.str(32); // lastConversionDateTime
  r.i16(); // part
  const songLength = r.f32();
  const tuningLength = r.u32();
  const tuning: number[] = [];
  for (let i = 0; i < tuningLength; i++) tuning.push(r.i16());

  // Determine arrangement type from manifest or filename
  const arrangementType = manifest?.arrangementName
    ? (manifest.arrangementName.charAt(0).toUpperCase() + manifest.arrangementName.slice(1).toLowerCase()) as 'Lead' | 'Rhythm' | 'Bass'
    : 'Lead';

  // Convert raw notes to RocksmithNote/RocksmithChord
  const notes: RocksmithNote[] = [];
  const chords: RocksmithChord[] = [];

  for (const raw of maxDiffNotes) {
    if (raw.chordId >= 0 && raw.chordId < chordTemplates.length) {
      // This is a chord
      const tpl = chordTemplates[raw.chordId];
      const chordNotes: RocksmithNote[] = [];
      for (let s = 0; s < 6; s++) {
        if (tpl.frets[s] >= 0) {
          chordNotes.push({
            time: raw.time,
            string: s,
            fret: tpl.frets[s],
            sustain: raw.sustain,
            bend: 0,
            slideTo: -1,
            slideUnpitchTo: -1,
            hammerOn: false,
            pullOff: false,
            harmonic: false,
            harmonicPinch: false,
            palmMute: false,
            mute: false,
            tremolo: false,
            vibrato: false,
            tap: false,
            accent: false,
            linkNext: false,
            ignore: false,
          });
        }
      }
      chords.push({
        time: raw.time,
        chordId: raw.chordId,
        strum: 'down',
        highDensity: false,
        chordNotes,
      });
    } else {
      // Single note
      notes.push({
        time: raw.time,
        string: raw.string,
        fret: raw.fret,
        sustain: raw.sustain,
        bend: raw.maxBend,
        slideTo: raw.slideTo,
        slideUnpitchTo: raw.slideUnpitchTo,
        hammerOn: !!(raw.mask & NOTE_MASK.hammerOn),
        pullOff: !!(raw.mask & NOTE_MASK.pullOff),
        harmonic: !!(raw.mask & NOTE_MASK.harmonic),
        harmonicPinch: !!(raw.mask & NOTE_MASK.harmonicPinch),
        palmMute: !!(raw.mask & NOTE_MASK.palmMute),
        mute: !!(raw.mask & NOTE_MASK.mute),
        tremolo: !!(raw.mask & NOTE_MASK.tremolo),
        vibrato: raw.vibrato > 0,
        tap: raw.tap > 0,
        accent: !!(raw.mask & NOTE_MASK.accent),
        linkNext: !!(raw.mask & NOTE_MASK.linkNext),
        ignore: !!(raw.mask & NOTE_MASK.ignore),
      });
    }
  }

  // Compute average tempo from beats
  let averageTempo = 120;
  if (beats.length >= 2) {
    const measureStarts = beats.filter(b => b.measure >= 0);
    if (measureStarts.length >= 2) {
      const totalTime = measureStarts[measureStarts.length - 1].time - measureStarts[0].time;
      const totalMeasures = measureStarts.length - 1;
      const avgMeasureDuration = totalTime / totalMeasures;
      // Assume 4/4 time
      averageTempo = Math.round(240 / avgMeasureDuration);
    }
  }

  return {
    arrangementType: arrangementType as 'Lead' | 'Rhythm' | 'Bass',
    title: manifest?.songName ?? '',
    artistName: manifest?.artistName ?? '',
    albumName: manifest?.albumName ?? '',
    tuning: tuning.length >= 6 ? tuning.slice(0, 6) : [0, 0, 0, 0, 0, 0],
    capoFret: capo,
    songLength,
    startBeat: beats.length > 0 ? beats[0].time : 0,
    averageTempo,
    beats,
    notes: notes.filter(n => !n.ignore),
    chords,
    chordTemplates,
    sections,
    phrases,
    phraseIterations,
  };
}

/**
 * Decrypt and parse an SNG file from raw (encrypted) bytes.
 * @param sngData Raw SNG bytes from PSARC extraction
 * @param platform 'windows' or 'mac'
 * @param manifest Optional metadata from JSON manifest
 */
export async function parseSng(
  sngData: Uint8Array,
  platform: 'windows' | 'mac' = 'windows',
  manifest?: SngManifestInfo,
): Promise<RocksmithArrangement> {
  // SNG header: magic(4) + platform(4) + iv(16) + payload + signature(56)
  const iv = sngData.slice(8, 24);
  const payload = sngData.slice(24, sngData.length - 56);

  // Decrypt
  const decrypted = decryptSng(payload, iv, platform);

  // First 4 bytes are uncompressed length (LE)
  const view = new DataView(decrypted.buffer, decrypted.byteOffset, 4);
  const _uncompressedLen = view.getUint32(0, true);

  // Decompress
  const decompressed = await inflate(decrypted.slice(4));

  return parseSngBinary(decompressed, manifest);
}
