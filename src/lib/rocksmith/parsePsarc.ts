/**
 * Browser-compatible PSARC (Rocksmith archive) parser.
 * Extracts arrangement XMLs, manifests, and audio from .psarc files.
 *
 * PSARC format:
 *   Header (32 bytes) + encrypted BOM (table of contents) + compressed data blocks
 *   Entry 0 is always the file listing (newline-delimited paths)
 *   Entries reference zlib-compressed blocks via offset + block size table
 */

// @ts-expect-error aes-js has no types
import aesjs from 'aes-js';

// AES-CFB key/IV for BOM decryption (public, same for all Rocksmith PSARCs)
const ARC_KEY_HEX = 'C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C';
const ARC_IV_HEX = 'E915AA018FEF71FC508132E4BB4CEB42';

const BLOCK_SIZE = 65536; // 2^16

function hexToBytes(hex: string): Uint8Array {
  return aesjs.utils.hex.toBytes(hex);
}

/** Read a big-endian uint32 from a DataView */
function readU32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

/** Read a big-endian uint16 from a DataView */
function readU16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

/** Read a 5-byte big-endian integer (used for offset and length fields) */
function read5ByteBE(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset + 1, 4).getUint32(0, false);
}

/** AES-256-CFB decryption using aes-js */
function aesCfbDecrypt(data: Uint8Array, keyHex: string, ivHex: string): Uint8Array {
  const key = hexToBytes(keyHex);
  const iv = hexToBytes(ivHex);
  // Pad to 16-byte boundary
  const padded = new Uint8Array(Math.ceil(data.length / 16) * 16);
  padded.set(data);
  const cfb = new aesjs.ModeOfOperation.cfb(key, iv, 16);
  const decrypted = cfb.decrypt(padded);
  return new Uint8Array(decrypted).slice(0, data.length);
}

/** Inflate (zlib decompress) a buffer using the browser's DecompressionStream API */
async function zlibInflate(data: Uint8Array): Promise<Uint8Array> {
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
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  try {
    return await tryDecompress('deflate');
  } catch {
    try {
      return await tryDecompress('raw');
    } catch {
      return data;
    }
  }
}

interface PsarcHeader {
  magic: string;
  version: number;
  compression: string;
  headerSize: number;
  entrySize: number;
  entryCount: number;
  blockSize: number;
  archiveFlags: number;
}

interface BomEntry {
  md5: string;
  zindex: number;
  length: number;
  offset: number;
}

function parseHeader(view: DataView): PsarcHeader {
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
  );
  if (magic !== 'PSAR') {
    throw new Error(`Not a PSARC file (magic: ${magic})`);
  }

  return {
    magic,
    version: readU32BE(view, 4),
    compression: String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
    ),
    headerSize: readU32BE(view, 12),
    entrySize: readU32BE(view, 16),
    entryCount: readU32BE(view, 20),
    blockSize: readU32BE(view, 24),
    archiveFlags: readU32BE(view, 28),
  };
}

function parseBomEntries(data: Uint8Array, entryCount: number): {entries: BomEntry[]; zlengths: number[]} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries: BomEntry[] = [];
  let offset = 0;

  for (let i = 0; i < entryCount; i++) {
    // MD5: 16 bytes as hex
    const md5Bytes = data.slice(offset, offset + 16);
    const md5 = Array.from(md5Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    offset += 16;

    // zindex: uint32 BE
    const zindex = readU32BE(view, offset);
    offset += 4;

    // length: 5 bytes BE
    const length = read5ByteBE(data, offset);
    offset += 5;

    // offset: 5 bytes BE
    const entryOffset = read5ByteBE(data, offset);
    offset += 5;

    entries.push({md5, zindex, length, offset: entryOffset});
  }

  // Remaining data is the zlength table (uint16 BE values)
  const zlengths: number[] = [];
  while (offset + 1 < data.length) {
    zlengths.push(readU16BE(view, offset));
    offset += 2;
  }

  return {entries, zlengths};
}

async function readEntry(
  archiveData: Uint8Array,
  entry: BomEntry,
  zlengths: number[],
  blockSize: number,
): Promise<Uint8Array> {
  let entryOffset = entry.offset;
  const entryLength = entry.length;
  const zl = zlengths.slice(entry.zindex);

  const chunks: Uint8Array[] = [];
  let totalRead = 0;

  for (let i = 0; i < zl.length; i++) {
    if (totalRead >= entryLength) break;

    const z = zl[i];
    const readSize = z === 0 ? blockSize : z;
    const block = archiveData.slice(entryOffset, entryOffset + readSize);
    entryOffset += readSize;

    let decompressed: Uint8Array;
    if (z === 0) {
      // z=0 means the block is stored uncompressed at full block size
      decompressed = block;
    } else {
      decompressed = await zlibInflate(block);
    }

    chunks.push(decompressed);
    totalRead += decompressed.length;
  }

  // Concatenate and trim to exact length
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(Math.min(totalLength, entryLength));
  let offset = 0;
  for (const chunk of chunks) {
    const copyLen = Math.min(chunk.length, result.length - offset);
    result.set(chunk.subarray(0, copyLen), offset);
    offset += copyLen;
    if (offset >= result.length) break;
  }

  return result;
}

export interface PsarcFile {
  path: string;
  data: Uint8Array;
}

export interface PsarcContents {
  /** All file paths in the archive */
  filePaths: string[];
  /** Parsed arrangements (from SNG binary or XML) */
  arrangements: PsarcFile[];
  /** JSON manifest files */
  manifests: PsarcFile[];
  /** SNG binary files (encrypted) */
  sngFiles: PsarcFile[];
  /** Toolkit info if present */
  toolkitInfo: string | null;
}

/**
 * Parse a PSARC archive and extract its contents.
 * Extracts SNG files, XML arrangements, and JSON manifests.
 */
export async function parsePsarc(data: Uint8Array): Promise<PsarcContents> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = parseHeader(view);

  // Extract and decrypt BOM
  const bomRaw = data.slice(32, header.headerSize);
  const bomPadded = new Uint8Array(Math.ceil(bomRaw.length / 16) * 16);
  bomPadded.set(bomRaw);
  const bomDecrypted = aesCfbDecrypt(bomPadded, ARC_KEY_HEX, ARC_IV_HEX);
  const bomTrimmed = bomDecrypted.slice(0, bomRaw.length);

  const {entries, zlengths} = parseBomEntries(bomTrimmed, header.entryCount);

  // Entry 0 is the file listing
  const listingData = await readEntry(data, entries[0], zlengths, header.blockSize || BLOCK_SIZE);
  const listing = new TextDecoder().decode(listingData);
  const filePaths = listing.split('\n').filter(p => p.length > 0);

  const result: PsarcContents = {
    filePaths,
    arrangements: [],
    manifests: [],
    sngFiles: [],
    toolkitInfo: null,
  };

  for (let i = 0; i < filePaths.length; i++) {
    const path = filePaths[i];
    const entryIdx = i + 1;
    if (entryIdx >= entries.length) break;

    const isSng =
      path.endsWith('.sng') &&
      !path.includes('_vocals.sng');

    const isXmlArrangement =
      path.endsWith('.xml') &&
      !path.includes('showlights') &&
      !path.includes('vocals') &&
      (path.includes('songs/arr/') || path.includes('songs/bin/'));

    const isManifest = path.endsWith('.json') && path.includes('manifests/') && !path.includes('_vocals.');
    const isToolkit = path.includes('toolkit.version');

    if (isSng || isXmlArrangement || isManifest || isToolkit) {
      const fileData = await readEntry(data, entries[entryIdx], zlengths, header.blockSize || BLOCK_SIZE);
      if (isSng) {
        result.sngFiles.push({path, data: fileData});
      } else if (isXmlArrangement) {
        result.arrangements.push({path, data: fileData});
      } else if (isManifest) {
        result.manifests.push({path, data: fileData});
      } else if (isToolkit) {
        result.toolkitInfo = new TextDecoder().decode(fileData);
      }
    }
  }

  return result;
}

/**
 * Extract a single file from the archive by path.
 */
export async function extractFile(
  data: Uint8Array,
  targetPath: string,
): Promise<Uint8Array | null> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = parseHeader(view);

  const bomRaw = data.slice(32, header.headerSize);
  const bomPadded = new Uint8Array(Math.ceil(bomRaw.length / 16) * 16);
  bomPadded.set(bomRaw);
  const bomDecrypted = aesCfbDecrypt(bomPadded, ARC_KEY_HEX, ARC_IV_HEX);
  const bomTrimmed = bomDecrypted.slice(0, bomRaw.length);

  const {entries, zlengths} = parseBomEntries(bomTrimmed, header.entryCount);

  // Get listing
  const listingData = await readEntry(data, entries[0], zlengths, header.blockSize || BLOCK_SIZE);
  const listing = new TextDecoder().decode(listingData);
  const filePaths = listing.split('\n').filter(p => p.length > 0);

  const idx = filePaths.findIndex(p => p.includes(targetPath));
  if (idx < 0) return null;

  return readEntry(data, entries[idx + 1], zlengths, header.blockSize || BLOCK_SIZE);
}
