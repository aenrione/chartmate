use aes::Aes256;
use cfb_mode::Decryptor as CfbDecryptor;
use cipher::{AsyncStreamCipher, KeyIvInit, StreamCipher};
use ctr::Ctr128BE;
use flate2::read::ZlibDecoder;
use serde::Serialize;
use std::io::Read;

const ARC_KEY: &str = "C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C";
const ARC_IV: &str = "E915AA018FEF71FC508132E4BB4CEB42";
const WIN_KEY: &str = "CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30";

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect()
}

fn read_u32_be(data: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

fn read_u16_be(data: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes([data[offset], data[offset + 1]])
}

fn read_5byte_be(data: &[u8], offset: usize) -> u64 {
    // 5-byte BE integer — use lower 4 bytes
    read_u32_be(data, offset + 1) as u64
}

fn read_u32_le(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

fn read_i32_le(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

fn read_i16_le(data: &[u8], offset: usize) -> i16 {
    i16::from_le_bytes([data[offset], data[offset + 1]])
}

fn read_f32_le(data: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

fn read_str(data: &[u8], offset: usize, len: usize) -> String {
    let slice = &data[offset..offset + len];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(len);
    String::from_utf8_lossy(&slice[..end]).to_string()
}

fn zlib_inflate(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(data);
    let mut result = Vec::new();
    decoder.read_to_end(&mut result).map_err(|e| e.to_string())?;
    Ok(result)
}

// ── PSARC parsing ──

struct BomEntry {
    zindex: u32,
    length: u64,
    offset: u64,
}

fn decrypt_bom(encrypted: &[u8]) -> Vec<u8> {
    let key = hex_to_bytes(ARC_KEY);
    let iv = hex_to_bytes(ARC_IV);

    // Pad to 16-byte boundary
    let mut padded = encrypted.to_vec();
    let pad_len = (16 - (padded.len() % 16)) % 16;
    padded.extend(vec![0u8; pad_len]);

    let decryptor = CfbDecryptor::<Aes256>::new_from_slices(&key, &iv).unwrap();
    decryptor.decrypt(&mut padded);

    padded.truncate(encrypted.len());
    padded
}

fn read_psarc_entry(data: &[u8], entry: &BomEntry, zlengths: &[u16], block_size: u32) -> Result<Vec<u8>, String> {
    let mut offset = entry.offset as usize;
    let entry_length = entry.length as usize;
    let zl = &zlengths[entry.zindex as usize..];

    let mut result = Vec::with_capacity(entry_length);

    for &z in zl {
        if result.len() >= entry_length {
            break;
        }
        let read_size = if z == 0 { block_size as usize } else { z as usize };
        if offset + read_size > data.len() {
            break;
        }
        let block = &data[offset..offset + read_size];
        offset += read_size;

        if z == 0 {
            result.extend_from_slice(block);
        } else {
            match zlib_inflate(block) {
                Ok(decompressed) => result.extend(decompressed),
                Err(_) => result.extend_from_slice(block),
            }
        }
    }

    result.truncate(entry_length);
    Ok(result)
}

// ── SNG parsing ──

fn decrypt_sng(sng_data: &[u8]) -> Result<Vec<u8>, String> {
    if sng_data.len() < 80 {
        return Err("SNG file too small".into());
    }

    let iv = &sng_data[8..24];
    let payload = &sng_data[24..sng_data.len() - 56];

    let key = hex_to_bytes(WIN_KEY);
    let mut decrypted = payload.to_vec();

    // AES-256-CTR
    let mut cipher = <Ctr128BE<Aes256> as KeyIvInit>::new_from_slices(&key, iv)
        .map_err(|e| e.to_string())?;
    cipher.apply_keystream(&mut decrypted);

    // First 4 bytes = uncompressed length, then zlib data
    if decrypted.len() < 4 {
        return Err("Decrypted SNG too small".into());
    }

    zlib_inflate(&decrypted[4..])
}

// ── SNG binary format → JSON structures ──

#[derive(Serialize)]
pub struct SngArrangement {
    pub arrangement_type: String,
    pub title: String,
    pub artist_name: String,
    pub album_name: String,
    pub tuning: Vec<i16>,
    pub capo_fret: i8,
    pub song_length: f32,
    pub average_tempo: f32,
    pub beats: Vec<SngBeat>,
    pub notes: Vec<SngNote>,
    pub chords: Vec<SngChord>,
    pub chord_templates: Vec<SngChordTemplate>,
    pub sections: Vec<SngSection>,
    pub phrases: Vec<SngPhrase>,
    pub phrase_iterations: Vec<SngPhraseIteration>,
}

#[derive(Serialize)]
pub struct SngBeat {
    pub time: f32,
    pub measure: i32,
}

#[derive(Serialize)]
pub struct SngNote {
    pub time: f32,
    pub string: i8,
    pub fret: i8,
    pub sustain: f32,
    pub bend: f32,
    pub slide_to: i8,
    pub slide_unpitch_to: i8,
    pub hammer_on: bool,
    pub pull_off: bool,
    pub harmonic: bool,
    pub harmonic_pinch: bool,
    pub palm_mute: bool,
    pub mute: bool,
    pub tremolo: bool,
    pub vibrato: bool,
    pub tap: bool,
    pub accent: bool,
    pub link_next: bool,
    pub ignore: bool,
}

#[derive(Serialize)]
pub struct SngChord {
    pub time: f32,
    pub chord_id: i32,
    pub chord_notes: Vec<SngNote>,
}

#[derive(Serialize)]
pub struct SngChordTemplate {
    pub chord_id: usize,
    pub chord_name: String,
    pub display_name: String,
    pub fingers: Vec<i8>,
    pub frets: Vec<i8>,
}

#[derive(Serialize)]
pub struct SngSection {
    pub name: String,
    pub number: u32,
    pub start_time: f32,
    pub end_time: f32,
}

#[derive(Serialize)]
pub struct SngPhrase {
    pub name: String,
    pub max_difficulty: u32,
}

#[derive(Serialize)]
pub struct SngPhraseIteration {
    pub phrase_id: u32,
    pub time: f32,
    pub end_time: f32,
}

// Note mask flags
const MASK_HAMMER_ON: u32 = 0x00000200;
const MASK_PULL_OFF: u32 = 0x00000400;
const MASK_HARMONIC: u32 = 0x00000020;
const MASK_HARMONIC_PINCH: u32 = 0x00008000;
const MASK_PALM_MUTE: u32 = 0x00000002;
const MASK_MUTE: u32 = 0x00000040;
const MASK_TREMOLO: u32 = 0x40000000;
const MASK_ACCENT: u32 = 0x04000000;
const MASK_LINK_NEXT: u32 = 0x00000008;
const MASK_IGNORE: u32 = 0x00040000;

fn parse_sng_binary(data: &[u8], manifest: Option<&ManifestInfo>) -> Result<SngArrangement, String> {
    let mut pos: usize = 0;

    macro_rules! u32le { () => {{ let v = read_u32_le(data, pos); pos += 4; v }}; }
    macro_rules! i32le { () => {{ let v = read_i32_le(data, pos); pos += 4; v }}; }
    macro_rules! f32le { () => {{ let v = read_f32_le(data, pos); pos += 4; v }}; }
    macro_rules! i8le { () => {{ let v = data[pos] as i8; pos += 1; v }}; }
    macro_rules! u16le { () => {{ let v = u16::from_le_bytes([data[pos], data[pos+1]]); pos += 2; v }}; }
    macro_rules! i16le { () => {{ let v = read_i16_le(data, pos); pos += 2; v }}; }
    macro_rules! skip { ($n:expr) => { pos += $n; }; }
    macro_rules! str_fixed { ($n:expr) => {{ let s = read_str(data, pos, $n); pos += $n; s }}; }

    // Beats
    let beats_count = u32le!() as usize;
    let mut beats = Vec::with_capacity(beats_count);
    for _ in 0..beats_count {
        let time = f32le!();
        let measure = u16le!() as i32;
        let beat = u16le!();
        skip!(8); // phraseIteration + mask
        beats.push(SngBeat {
            time,
            measure: if beat == 0 { measure } else { -1 },
        });
    }

    // Phrases
    let phrases_count = u32le!() as usize;
    let mut phrases = Vec::with_capacity(phrases_count);
    for _ in 0..phrases_count {
        skip!(4); // solo, disparity, ignore, padding
        let max_difficulty = u32le!();
        skip!(4); // phraseIterationLinks
        let name = str_fixed!(32);
        phrases.push(SngPhrase { name, max_difficulty });
    }

    // Chord templates
    let ct_count = u32le!() as usize;
    let mut chord_templates = Vec::with_capacity(ct_count);
    for i in 0..ct_count {
        skip!(4); // mask
        let frets: Vec<i8> = (0..6).map(|_| i8le!()).collect();
        let fingers: Vec<i8> = (0..6).map(|_| i8le!()).collect();
        skip!(24); // notes[6] as i32
        let name = str_fixed!(32);
        chord_templates.push(SngChordTemplate {
            chord_id: i,
            chord_name: name.clone(),
            display_name: name,
            fingers,
            frets,
        });
    }

    // Chord notes
    let cn_count = u32le!() as usize;
    // Each chord note: 24 (mask) + 6*(32*12+4) (bends) + 6 (slideTo) + 6 (slideUnpitchTo) + 12 (vibrato)
    let cn_size = 24 + 6 * (32 * 12 + 4) + 6 + 6 + 12;
    skip!(cn_count * cn_size);

    // Vocals
    let vocals_count = u32le!() as usize;
    skip!(vocals_count * (4 + 4 + 4 + 48)); // time + note + length + lyrics

    // Symbols (only if vocals > 0)
    if vocals_count > 0 {
        let ha_len = u32le!() as usize;
        skip!(ha_len * 32);
        let tex_len = u32le!() as usize;
        skip!(tex_len * (128 + 4 + 4 + 4 + 4));
        let def_len = u32le!() as usize;
        skip!(def_len * (12 + 16 + 16));
    }

    // Phrase iterations
    let pi_count = u32le!() as usize;
    let mut phrase_iterations = Vec::with_capacity(pi_count);
    for _ in 0..pi_count {
        let phrase_id = u32le!();
        let time = f32le!();
        let end_time = f32le!();
        skip!(12); // difficulty[3]
        phrase_iterations.push(SngPhraseIteration { phrase_id, time, end_time });
    }

    // Phrase extra info
    let pei_count = u32le!() as usize;
    skip!(pei_count * 12);

    // New linked diffs (variable size)
    let nld_count = u32le!() as usize;
    for _ in 0..nld_count {
        skip!(4); // levelBreak
        let nld_phrase_len = u32le!() as usize;
        skip!(nld_phrase_len * 4);
    }

    // Actions
    let actions_count = u32le!() as usize;
    skip!(actions_count * (4 + 256));

    // Events
    let events_count = u32le!() as usize;
    skip!(events_count * (4 + 256));

    // Tones
    let tone_count = u32le!() as usize;
    skip!(tone_count * 8);

    // DNA
    let dna_count = u32le!() as usize;
    skip!(dna_count * 8);

    // Sections
    let sections_count = u32le!() as usize;
    let mut sections = Vec::with_capacity(sections_count);
    for _ in 0..sections_count {
        let name = str_fixed!(32);
        let number = u32le!();
        let start_time = f32le!();
        let end_time = f32le!();
        skip!(8 + 36); // startPhraseIterationId + endPhraseIterationId + stringMask
        sections.push(SngSection { name, number, start_time, end_time });
    }

    // Levels — contains notes
    let levels_count = u32le!() as usize;
    let mut max_diff: i32 = -1;
    let mut max_diff_notes: Vec<RawNote> = Vec::new();

    for _ in 0..levels_count {
        let difficulty = u32le!() as i32;

        // Anchors
        let anchors_count = u32le!() as usize;
        skip!(anchors_count * 28); // 7 fields × 4 bytes

        // Anchor extensions
        let anc_ext_count = u32le!() as usize;
        skip!(anc_ext_count * 12); // 4 + 1 + 7

        // Fingerprints (2 arrays)
        for _ in 0..2 {
            let fp_count = u32le!() as usize;
            skip!(fp_count * 20); // 5 fields × 4 bytes
        }

        // Notes
        let notes_count = u32le!() as usize;
        let mut level_notes = Vec::with_capacity(notes_count);

        for _ in 0..notes_count {
            let mask = u32le!();
            skip!(4); // flags
            skip!(4); // hash
            let time = f32le!();
            let string = i8le!();
            let fret = i8le!();
            skip!(2); // anchorFret + anchorWidth
            let chord_id = i32le!();
            skip!(4); // chordNoteId
            skip!(4); // phraseId
            skip!(4); // phraseIterationId
            skip!(4); // fingerPrintId[2]
            skip!(6); // nextIterNote + prevIterNote + parentPrevNote
            let slide_to = i8le!();
            let slide_unpitch_to = i8le!();
            skip!(1); // leftHand
            let tap = i8le!();
            skip!(3); // pickDirection + slap + pluck
            let vibrato = i16le!();
            let sustain = f32le!();
            let max_bend = f32le!();
            let bend_count = u32le!() as usize;
            skip!(bend_count * 12); // each bend: time(f32=4) + step(f32=4) + padding(3) + unk(i8=1) = 12

            level_notes.push(RawNote {
                mask, time, string, fret, chord_id, slide_to, slide_unpitch_to,
                tap, vibrato, sustain, max_bend,
            });
        }

        // Average notes per iteration
        let avg_count = u32le!() as usize;
        skip!(avg_count * 4);

        if difficulty > max_diff {
            max_diff = difficulty;
            max_diff_notes = level_notes;
        }
    }

    // Metadata
    skip!(32); // 4 doubles
    skip!(8); // firstBeatLength + startTime
    let capo = i8le!();
    skip!(32); // lastConversionDateTime
    skip!(2); // part
    let song_length = f32le!();
    let tuning_length = u32le!() as usize;
    let tuning: Vec<i16> = (0..tuning_length).map(|_| i16le!()).collect();

    // Compute average tempo
    let measure_starts: Vec<f32> = beats.iter().filter(|b| b.measure >= 0).map(|b| b.time).collect();
    let average_tempo = if measure_starts.len() >= 2 {
        let total_time = measure_starts.last().unwrap() - measure_starts.first().unwrap();
        let total_measures = (measure_starts.len() - 1) as f32;
        (240.0 / (total_time / total_measures)).round()
    } else {
        120.0
    };

    // Convert raw notes
    let mut notes = Vec::new();
    let mut chords = Vec::new();

    for raw in &max_diff_notes {
        if raw.chord_id >= 0 && (raw.chord_id as usize) < chord_templates.len() {
            let tpl = &chord_templates[raw.chord_id as usize];
            let chord_notes: Vec<SngNote> = tpl.frets.iter().enumerate()
                .filter(|(_, &f)| f >= 0)
                .map(|(s, &f)| SngNote {
                    time: raw.time, string: s as i8, fret: f, sustain: raw.sustain,
                    bend: 0.0, slide_to: -1, slide_unpitch_to: -1,
                    hammer_on: false, pull_off: false, harmonic: false, harmonic_pinch: false,
                    palm_mute: false, mute: false, tremolo: false, vibrato: false,
                    tap: false, accent: false, link_next: false, ignore: false,
                })
                .collect();
            chords.push(SngChord { time: raw.time, chord_id: raw.chord_id, chord_notes });
        } else if raw.mask & MASK_IGNORE == 0 {
            notes.push(SngNote {
                time: raw.time, string: raw.string, fret: raw.fret,
                sustain: raw.sustain, bend: raw.max_bend,
                slide_to: raw.slide_to, slide_unpitch_to: raw.slide_unpitch_to,
                hammer_on: raw.mask & MASK_HAMMER_ON != 0,
                pull_off: raw.mask & MASK_PULL_OFF != 0,
                harmonic: raw.mask & MASK_HARMONIC != 0,
                harmonic_pinch: raw.mask & MASK_HARMONIC_PINCH != 0,
                palm_mute: raw.mask & MASK_PALM_MUTE != 0,
                mute: raw.mask & MASK_MUTE != 0,
                tremolo: raw.mask & MASK_TREMOLO != 0,
                vibrato: raw.vibrato > 0,
                tap: raw.tap > 0,
                accent: raw.mask & MASK_ACCENT != 0,
                link_next: raw.mask & MASK_LINK_NEXT != 0,
                ignore: false,
            });
        }
    }

    let arr_type = manifest.map(|m| m.arrangement_name.clone()).unwrap_or_else(|| "Lead".into());

    Ok(SngArrangement {
        arrangement_type: arr_type,
        title: manifest.map(|m| m.song_name.clone()).unwrap_or_default(),
        artist_name: manifest.map(|m| m.artist_name.clone()).unwrap_or_default(),
        album_name: manifest.map(|m| m.album_name.clone()).unwrap_or_default(),
        tuning: if tuning.len() >= 6 { tuning[..6].to_vec() } else { vec![0; 6] },
        capo_fret: capo,
        song_length,
        average_tempo,
        beats,
        notes,
        chords,
        chord_templates,
        sections,
        phrases,
        phrase_iterations,
    })
}

struct RawNote {
    mask: u32,
    time: f32,
    string: i8,
    fret: i8,
    chord_id: i32,
    slide_to: i8,
    slide_unpitch_to: i8,
    tap: i8,
    vibrato: i16,
    sustain: f32,
    max_bend: f32,
}

#[derive(Serialize)]
struct ManifestInfo {
    arrangement_name: String,
    song_name: String,
    artist_name: String,
    album_name: String,
}

fn parse_manifest(json_data: &[u8]) -> Option<ManifestInfo> {
    let v: serde_json::Value = serde_json::from_slice(json_data).ok()?;
    let entries = v.get("Entries")?.as_object()?;
    let first_entry = entries.values().next()?;
    let attrs = first_entry.get("Attributes")?;

    Some(ManifestInfo {
        arrangement_name: attrs.get("ArrangementName")?.as_str()?.to_string(),
        song_name: attrs.get("SongName")?.as_str().unwrap_or("").to_string(),
        artist_name: attrs.get("ArtistName")?.as_str().unwrap_or("").to_string(),
        album_name: attrs.get("AlbumName")?.as_str().unwrap_or("").to_string(),
    })
}

// ── Tauri command ──

#[derive(Serialize)]
pub struct PsarcResult {
    pub arrangements: Vec<SngArrangement>,
}

#[tauri::command]
pub fn parse_psarc(path: String) -> Result<PsarcResult, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    if data.len() < 32 {
        return Err("File too small".into());
    }

    let magic = std::str::from_utf8(&data[0..4]).unwrap_or("");
    if magic != "PSAR" {
        return Err(format!("Not a PSARC file (magic: {magic})"));
    }

    let header_size = read_u32_be(&data, 12) as usize;
    let entry_count = read_u32_be(&data, 20) as usize;
    let block_size = read_u32_be(&data, 24);

    // Decrypt BOM
    let bom_raw = &data[32..header_size];
    let bom = decrypt_bom(bom_raw);

    // Parse BOM entries
    let mut entries = Vec::with_capacity(entry_count);
    for i in 0..entry_count {
        let off = i * 30;
        entries.push(BomEntry {
            zindex: read_u32_be(&bom, off + 16),
            length: read_5byte_be(&bom, off + 20),
            offset: read_5byte_be(&bom, off + 25),
        });
    }

    // Zlength table
    let zl_start = entry_count * 30;
    let mut zlengths = Vec::new();
    let mut i = zl_start;
    while i + 1 < bom.len() {
        zlengths.push(read_u16_be(&bom, i));
        i += 2;
    }

    // Entry 0 = file listing
    let listing_data = read_psarc_entry(&data, &entries[0], &zlengths, block_size)?;
    let listing = String::from_utf8_lossy(&listing_data);
    let file_paths: Vec<&str> = listing.split('\n').filter(|s| !s.is_empty()).collect();

    // Extract SNG files and JSON manifests
    let mut sng_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut manifests: Vec<(String, Vec<u8>)> = Vec::new();

    for (idx, path) in file_paths.iter().enumerate() {
        let entry_idx = idx + 1;
        if entry_idx >= entries.len() { break; }

        if path.ends_with(".sng") && !path.contains("_vocals.sng") {
            let file_data = read_psarc_entry(&data, &entries[entry_idx], &zlengths, block_size)?;
            sng_files.push((path.to_string(), file_data));
        } else if path.ends_with(".json") && path.contains("manifests/") && !path.contains("_vocals.") {
            let file_data = read_psarc_entry(&data, &entries[entry_idx], &zlengths, block_size)?;
            manifests.push((path.to_string(), file_data));
        }
    }

    // Parse manifests
    let mut manifest_map: std::collections::HashMap<String, ManifestInfo> = std::collections::HashMap::new();
    for (path, data) in &manifests {
        if let Some(info) = parse_manifest(data) {
            let name = path.split('/').last().unwrap_or("").replace(".json", "");
            manifest_map.insert(name, info);
        }
    }

    // Decrypt and parse SNG files
    let mut arrangements = Vec::new();
    for (path, sng_data) in &sng_files {
        let name = path.split('/').last().unwrap_or("").replace(".sng", "");
        let manifest = manifest_map.get(&name);

        match decrypt_sng(sng_data) {
            Ok(decompressed) => {
                match parse_sng_binary(&decompressed, manifest) {
                    Ok(arr) => arrangements.push(arr),
                    Err(e) => eprintln!("Failed to parse SNG {path}: {e}"),
                }
            }
            Err(e) => eprintln!("Failed to decrypt SNG {path}: {e}"),
        }
    }

    if arrangements.is_empty() {
        return Err("No arrangements found in PSARC file".into());
    }

    Ok(PsarcResult { arrangements })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_psarc() {
        let home = std::env::var("HOME").unwrap();
        let path = format!("{}/Downloads/Eric-Clapton_Knockin-On-Heavens-Door_v1_1_p.psarc", home);
        if !std::path::Path::new(&path).exists() {
            eprintln!("Test file not found, skipping");
            return;
        }
        let result = parse_psarc(path).unwrap();
        assert!(!result.arrangements.is_empty(), "Should have arrangements");
        let arr = &result.arrangements[0];
        println!("Title: {} by {}", arr.title, arr.artist_name);
        println!("Arrangement: {}", arr.arrangement_type);
        println!("Beats: {}, Notes: {}, Chords: {}", arr.beats.len(), arr.notes.len(), arr.chords.len());
        println!("Sections: {}, Tempo: {}", arr.sections.len(), arr.average_tempo);
        println!("Tuning: {:?}, Capo: {}", arr.tuning, arr.capo_fret);
        assert!(!arr.beats.is_empty());
        assert!(arr.notes.len() + arr.chords.len() > 0, "Should have notes or chords");
    }
}
